const { MongoClient } = require('mongodb');

(async () => {
  const client = new MongoClient('mongodb://127.0.0.1:27017');
  await client.connect();
  const db = client.db('xplore26');

  try {
    const existingTimeout = await db.collection('submissions').findOne({
      _id: { $ne: undefined },
    });
    console.log("Success:", !!existingTimeout);
  } catch (err) {
    console.error("Error from MongoDB:", err.message);
  }
  process.exit(0);
})();
