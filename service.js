const express = require('express');

module.exports = function (collection) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    try {
      const [
        luzSemanal,
        luzMensual,
        dataMensual,
        dataSemanal,
        ultimaData,
      ] = await Promise.all([
        getLuzSemanal(),
        getLuzMensual(),
        getDataMensual(),
        getDataSemanal(),
        getUltimaData(),
      ]);

      res.render('index', {
        title: 'Medidores',
        humedadActual: ultimaData.humedad,
        humedadSueloActual: ultimaData.humedadSuelo,
        temperaturaActual: ultimaData.temperatura,
        luzActual: ultimaData.luz ? 'ON' : 'OFF',
        Labels: dataMensual.labels,
        LabelsSemanal: dataSemanal.labels,
        humedadData: dataMensual.humedadData,
        humedadSueloData: dataMensual.humedadSueloData,
        temperaturaData: dataMensual.temperaturaData,
        luzData: luzMensual,
        humedadDataSemanal: dataSemanal.humedadData,
        humedadSueloDataSemanal: dataSemanal.humedadSueloData,
        temperaturaDataSemanal: dataSemanal.temperaturaData,
        luzDataSemanal: luzSemanal
      });
    } catch (err) {
      res.status(500).send(err.message);
    }
  });

  router.post('/', async (req, res) => {
    try {
      console.log(req.body)
      const { humedad, humedad_suelo, temperatura, luz } = req.body;
      const now = new Date();
      const localDate = new Date(now.getTime() - 3 * 60 * 60000);

      let humedad_sueloF = parseInt(100 * (1 - humedad_suelo / 4095));
      let luzF = luz == 1 ? false : true;

      await collection.insertOne({ humedad, humedad_suelo: humedad_sueloF, temperatura, luz:luzF, fecha: localDate });
      res.status(201).json({ message: 'Datos guardados' });
    } catch (err) {
      res.status(500).json({ error: 'Error DB', mensaje: err.message });
    }
  });

  async function getDataMensual() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    const pipeline = [
      { $match: { fecha: { $gte: startOfMonth, $lt: endOfMonth } } },
      {
        $group: {
          _id: { day: { $dayOfMonth: '$fecha' } },
          fecha: { $first: '$fecha' },
          avgHumidity: { $avg: '$humedad' },
          avgSoilHumidity: { $avg: '$humedad_suelo' },
          avgTemperature: { $avg: '$temperatura' },
          avgLight: { $avg: '$luz' }
        },
      },
      { $sort: { '_id.day': 1 } }
    ];

    const results = await collection.aggregate(pipeline).toArray();

    const labels = [];
    const humedadData = [];
    const humedadSueloData = [];
    const temperaturaData = [];
    const luzData = [];

    for (let d = 1; d <= now.getDate(); d++) {
      labels.push(String(d));
      const dayData = results.find((r) => r._id.day === d);
      humedadData.push(dayData ? Math.round(dayData.avgHumidity) : null);
      humedadSueloData.push(dayData ? Math.round(dayData.avgSoilHumidity) : null);
      temperaturaData.push(dayData ? Math.round(dayData.avgTemperature) : null);
      luzData.push(dayData ? Math.round(dayData.avgLight) : null);
    }

    return { labels, humedadData, humedadSueloData, temperaturaData, luzData };
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
          _id: { dia: { $dayOfWeek: '$fecha' } },
          avgHumidity: { $avg: '$humedad' },
          avgSoilHumidity: { $avg: '$humedad_suelo' },
          avgTemperature: { $avg: '$temperatura' },
          avgLight: { $avg: '$luz' }
        },
      },
    ];

    const results = await collection.aggregate(pipeline).toArray();

    const map = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6 };
    const labels = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
    const humedadData = Array(7).fill(null);
    const humedadSueloData = Array(7).fill(null);
    const temperaturaData = Array(7).fill(null);
    const luzData = Array(7).fill(null);

    for (const r of results) {
      const idx = map[r._id.dia];
      humedadData[idx] = Math.round(r.avgHumidity);
      humedadSueloData[idx] = Math.round(r.avgSoilHumidity);
      temperaturaData[idx] = Math.round(r.avgTemperature);
      luzData[idx] = Math.round(r.avgLight);
    }

    return { labels, humedadData, humedadSueloData, temperaturaData, luzData };
  }

  async function getUltimaData() {
    const doc = await collection.findOne({}, { sort: { fecha: -1 } });
    if (!doc) return null;
    return {
      humedad: doc.humedad,
      humedadSuelo: doc.humedad_suelo,
      luz: doc.luz,
      temperatura: doc.temperatura,
    };
  }

  async function getLuzSemanal() {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - startOfWeek.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);

    const datos = await collection.find({ fecha: { $gte: startOfWeek, $lt: endOfWeek } }).sort({ fecha: 1 }).toArray();
    const horasLuz = Array(7).fill(0);

    for (let i = 1; i < datos.length; i++) {
      const a = datos[i - 1];
      const b = datos[i];
      const fa = new Date(a.fecha);
      const fb = new Date(b.fecha);

      if (fa.getFullYear() !== fb.getFullYear() || fa.getMonth() !== fb.getMonth() || fa.getDate() !== fb.getDate()) continue;

      if (a.luz === true && b.luz === true) {
        const diffMin = (b.fecha - a.fecha) / 1000 / 60;
        horasLuz[fa.getDay()] += diffMin / 60;
      }
    }

    return horasLuz.map((h) => Math.round(h * 100) / 100);
  }

  async function getLuzMensual() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    const datos = await collection.find({ fecha: { $gte: startOfMonth, $lt: endOfMonth } }).sort({ fecha: 1 }).toArray();
    const horasLuz = Array(now.getDate()).fill(0);

    for (let i = 1; i < datos.length; i++) {
      const a = datos[i - 1];
      const b = datos[i];
      const fa = new Date(a.fecha);
      const fb = new Date(b.fecha);

      if (fa.getFullYear() !== fb.getFullYear() || fa.getMonth() !== fb.getMonth() || fa.getDate() !== fb.getDate()) continue;

      if (a.luz === true && b.luz === true) {
        const diffMin = (b.fecha - a.fecha) / 1000 / 60;
        horasLuz[fa.getDate() - 1] += diffMin / 60;
      }
    }

    return horasLuz.map((h) => Math.round(h * 100) / 100);
  }

  return router;
};
