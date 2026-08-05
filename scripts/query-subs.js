const { MongoClient } = require('mongodb');
(async () => {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  const db = client.db('xplore26');
  const challenges = await db.collection('challenges').find({ slug: { $regex: /connections/i } }).toArray();
  console.log(JSON.stringify(challenges, null, 2));
  process.exit(0);
})();
