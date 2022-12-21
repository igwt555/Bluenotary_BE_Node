const mongoose = require("mongoose");
const loadModels = require("../models");
module.exports = async () => {
  const connect = () => {
    mongoose.Promise = global.Promise;
    return new Promise((resolve, reject) => {
      const DB_URL = process.env.MONGO_URI;
      mongoose.connect(
        DB_URL,
        {
          keepAlive: true,
          // reconnectTries: Number.MAX_VALUE,
          useNewUrlParser: true,
          useUnifiedTopology: true,
          // autoReconnect: true,
        },
        (err) => {
          let dbStatus = "";
          if (err) {
            dbStatus = `*    Error connecting to DB: ${err}\n****************************\n`;
            reject(err);
          }
          dbStatus = `*    DB Connection: OK\n****************************\n`;
          if (process.env.NODE_ENV !== "test") {
            // Prints initialization
            console.log("****************************");
            console.log("*    Starting Server.... ");
            console.log(`*    Port: ${process.env.PORT || 3000}`);
            console.log(`*    NODE_ENV: ${process.env.NODE_ENV}`);
            console.log(`*    Database: MongoDB`);
            console.log(dbStatus);
          }
        },
      );
      mongoose.set("useCreateIndex", true);
      mongoose.set("useFindAndModify", false);
      resolve(0);
    });
  };

  // const initDB = () => { };
  try {
    await connect();
    mongoose.connection.on("error", console.log);
    mongoose.connection.on("disconnected", connect);
    loadModels();
  } catch (err) {
    console.log(err);

  }
};
