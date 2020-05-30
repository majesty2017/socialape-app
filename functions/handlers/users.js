const { admin, db } = require("../util/admin");

const config = require('../util/config')

const firebase = require('firebase');
firebase.initializeApp(config); 

const { validateSignupData, validateLoginData } = require('../util/validators');

exports.signup = (req, res) => {
  const newUser = {
    email: req.body.email,
    password: req.body.password,
    confirmPassword: req.body.confirmPassword,
    handle: req.body.handle,
  };

  // Validating input fields
  const { valid, errors } = validateSignupData(newUser);

  if(!valid) return res.status(400).json(errors);

  const noImage = 'no-img.png';

  let token, userId;

  db.doc(`/users/${newUser.handle}`)
    .get()
    .then((doc) => {
      if (doc.exists) {
        return res
          .status(400)
          .json({ handle: "this handle is already taken." });
      } else {
        return firebase
          .auth()
          .createUserWithEmailAndPassword(newUser.email, newUser.password);
      }
    })
    .then((data) => {
      userId = data.user.uid;
      return data.user.getIdToken();
    })
    .then((idToken) => {
      token = idToken;
      // User credentials
      const userCredentials = {
        handle: newUser.handle,
        email: newUser.email,
        createdAt: new Date().toISOString(),
        imageUrl: `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${noImage}?alt=media`,
        userId,
      };
      // Sends user data into the database collection
      return db.doc(`/users/${newUser.handle}`).set(userCredentials);
    }) // Returns a user token
    .then(() => {
      return res.status(201).json({ token });
    })
    .catch((err) => {
      console.error(err);
      if (err.code === "auth/email-already-in-use") {
        return res.status(400).json({ email: "Email is already in use." });
      } else {
        return res.status(500).json({ error: err.code });
      }
    });
};

exports.login = (req, res) => {
  const user = {
    email: req.body.email,
    password: req.body.password,
  };

  // Validating input fields
  const { valid, errors } = validateLoginData(user);

  if(!valid) return res.status(400).json(errors);

  firebase
    .auth()
    .signInWithEmailAndPassword(user.email, user.password)
    .then((data) => {
      return data.user.getIdToken();
    })
    .then((token) => {
      return res.json({ token });
    })
    .catch((err) => {
      console.error(err);
      if (err.code === "auth/wrong-password") {
        return res
          .status(400)
          .json({ general: "Wrong credentials, please try again." });
      } else return res.status(500).json({ error: err.code });
    });
};

exports.uploadImage = (req, res) => {
  const busBoy = require('busboy');
  const path = require('path');
  const os = require('os');
  const fs = require('fs');

  let imageFilename;
  let imageToBeUploaded = {};

  busboy.on('file', (fieldname, file, filename, encoding, mimeType) => {

    console.log(fieldname);
    console.log(filename);
    console.log(mimeType);    

    const imageExtension = filename.split('.')[filename.split('.').length - 1];
    imageFilename = `${Math.round(Math.random() * 1000000000)}.${imageExtension}`;
    const filepath = path.join(os.tmpdir(), imageFilename);
    imageToBeUploaded = {filepath, mimeType};

    file.pipe(fs.createWriteStream(filepath));
  });
  busboy.on('finish', () => {
    admin.storage().bucket().upload(imageToBeUploaded.filepath, {
      resumable: false,
      metadata: {
        metadata: {
          contentType: imageToBeUploaded.mimeType
        }
      }
    })
    .then(() => {
      const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${imageFilename}?alt=media`;
      return db.doc(`/users/${req.user.handle}`).update({ imageUrl });
    })
    .then(() => {
      return res.json({ message: 'Image uploaded successfully.' });
    })
    .catch((err) => {
      console.error(err);
      return res.status(500).json({ error: err.code });
    });
  });
  busboy.end(req.rawBody);

  const busboy = new busBoy({ headers: req.headers });


}