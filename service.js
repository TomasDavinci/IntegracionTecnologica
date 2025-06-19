const express = require('express');

module.exports = function(collection) {
    const router = express.Router();

    router.get('/', async (req, res) => {
        try {
            const luzSemanal = await getLuzSemanal();
            const luzMensual = await getLuzMensual();
            const dataMensual = await getDataMensual();
            const dataSemanal = await getDataSemanal();
            const ultimaData = await getUltimaData();
            res.render('index', {
                title: 'Medidores',
                humedadActual: ultimaData.humedad,
                temperaturaActual: ultimaData.temperatura,
                luzActual:ultimaData.luz > 500 ? 'ON' : 'OFF',
                Labels: dataMensual.labels,
                LabelsSemanal:dataSemanal.labels,
                humedadData: dataMensual.humedadData,
                temperaturaData: dataMensual.temperaturaData,
                luzData: luzMensual,
                humedadDataSemanal: dataSemanal.humedadData,
                temperaturaDataSemanal: dataSemanal.temperaturaData,
                luzDataSemanal: luzSemanal
            });
        } catch (err) {
            res.status(500).send(err.message);
        }
    });

    router.post('/', async (req, res) => {
        try {
            const { humedad, temperatura, luz } = req.body;
            const now = new Date();
            const argentinaOffset = -3 * 60;
            const localDate = new Date(now.getTime() + argentinaOffset * 60000);
            const doc = {
                humedad,
                temperatura,
                luz,
                fecha:localDate
            };

            await collection.insertOne(doc);
            res.status(201).json({ message: 'Datos guardaros' });
        } catch (err) {
            res.status(500).json({ error: 'error DB', mensaje: err.message });
        }
    });
    
    async function getDataMensual(){
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const today = now.getDate();

        const startOfMonth = new Date(year, month, 1);
        const endOfMonth = new Date(year, month, today + 1);

         const pipeline = [
                {
                    $match: {
                        fecha: { $gte: startOfMonth, $lt: endOfMonth }
                    }
                },
                {
                    $group: {
                        _id: { day: { $dayOfMonth: "$fecha" } },
                        _diaDeLaSemana: { $first: { $dayOfWeek: "$fecha" } },
                        fecha: { $first: "$fecha" },
                        avgHumidity: { $avg: "$humedad" },
                        avgTemperature: { $avg: "$temperatura" },
                        avgLight: { $avg: "$luz" }
                    }
                },
                {
                    $sort: { "_id.day": 1 }
                }
            ];
            
        let results = await collection.aggregate(pipeline).toArray();
        const labels = [];
        const  humedadData = [];
        const temperaturaData = [];
        const luzData = [];

        for (let d = 1; d <= today; d++) {
                
                labels.push(`${d}`);
                
                const dayData = results.find(r => r._id.day === d);
                humedadData.push(dayData ? Math.round(dayData.avgHumidity) : null);
                temperaturaData.push(dayData ? Math.round(dayData.avgTemperature) : null);
                luzData.push(dayData ? Math.round(dayData.avgLight) : null);
        }

        const dataMensual = {
            labels: labels,
            humedadData: humedadData,
            temperaturaData: temperaturaData,
            luzData: luzData
        };
        return dataMensual;
    }

    async function getDataSemanal() {
        const now = new Date();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1));
        startOfWeek.setHours(0, 0, 0, 0);

        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 7);

        const pipeline = [
            { $match: { fecha: { $gte: startOfWeek, $lt: endOfWeek } } },
            {
                $group: {
                    _id: { dia: { $dayOfWeek: "$fecha" } },
                    avgHumidity: { $avg: "$humedad" },
                    avgTemperature: { $avg: "$temperatura" },
                    avgLight: { $avg: "$luz" }
                }
            }
        ];

        const results = await collection.aggregate(pipeline).toArray();

        const map = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6 };
        const labels = ["D", "L", "M", "M", "J", "V", "S"];
        const humedadData = Array(7).fill(null);
        const temperaturaData = Array(7).fill(null);
        const luzData = Array(7).fill(null);

        for (const r of results) {
            const idx = map[r._id.dia];
            humedadData[idx] = Math.round(r.avgHumidity);
            temperaturaData[idx] = Math.round(r.avgTemperature);
            luzData[idx] = Math.round(r.avgLight);
        }
        return { labels, humedadData, temperaturaData, luzData };
    }

    async function getUltimaData() {
    const doc = await collection.findOne({}, { sort: { fecha: -1 } });
    return doc ? { humedad: doc.humedad, luz: doc.luz, temperatura: doc.temperatura } : null;

    }

async function getLuzSemanal() {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - startOfWeek.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);

    const datos = await collection.find({
        fecha: { $gte: startOfWeek, $lt: endOfWeek }
    }).sort({ fecha: 1 }).toArray();

    const horasLuz = Array(7).fill(0);

    for (let i = 1; i < datos.length; i++) {
        const a = datos[i - 1];
        const b = datos[i];
        if (a.luz === true && b.luz === true) {
            const min = (b.fecha - a.fecha) / 1000 / 60;
            const dia = new Date(a.fecha).getDay();
            horasLuz[dia] += min / 60;
        }
    }

    return horasLuz.map(h => Math.round(h * 100) / 100);
}

    async function getLuzMensual() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const today = now.getDate();

    const startOfMonth = new Date(year, month, 1);
    const endOfMonth = new Date(year, month, today + 1);

    const datos = await collection.find({
        fecha: { $gte: startOfMonth, $lt: endOfMonth }
    }).sort({ fecha: 1 }).toArray();

    const horasLuz = Array(today).fill(0);

    for (let i = 1; i < datos.length; i++) {
        const a = datos[i - 1];
        const b = datos[i];
        if (a.luz === true && b.luz === true) {
            const min = (b.fecha - a.fecha) / 1000 / 60;
            const dia = new Date(a.fecha).getDate() - 1;
            horasLuz[dia] += min / 60;
        }
    }

    return horasLuz.map(h => Math.round(h * 100) / 100);
}

    return router;
};
