const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const port = process.env.PORT || 5000;
const {MongoClient, ServerApiVersion} = require("mongodb");

// middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster1.ll4tlqm.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    const usersCollection = client.db("artOasisDB").collection("users");

    app.get("/users", async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.get("/instructors", async (req, res) => {
      const query = {role: "instructor"};
      const result = await usersCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = {email: user.email};
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({message: "user already exists"});
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    await client.db("admin").command({ping: 1});
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Art Oasis Server Ongoing");
});

app.listen(port, () => {
  console.log(`Art Oasis Server Ongoing On Port ${port}`);
});

app.listen();
