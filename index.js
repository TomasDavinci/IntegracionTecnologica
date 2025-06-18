const express = require('express');
const { MongoClient } = require('mongodb');

const app = express();
const puerto = 3000;

const MONGO_URI = 'mongodb+srv://davinci:123456abc@integraciontecnologica.xw2ldlf.mongodb.net/';
const DB_NAME = 'integracionTecnologica';
const COLLECTION = 'medidas';

let db, collection;

MongoClient.connect(MONGO_URI, { useUnifiedTopology: true })
    .then(client => {
        db = client.db(DB_NAME);
        collection = db.collection(COLLECTION);
        console.log('conectado a MongoDB');
        const serviceRoutes = require('./service')(collection);
        app.use('/', serviceRoutes);
    })
    .catch(err => {
        console.error('error MongoDB:', err);
    });

app.use(express.json());

app.set('view engine', 'pug');
app.set('views', './views');

app.listen(puerto, () => {
    console.log(`Servidor levantado http://localhost:${puerto}`);
});