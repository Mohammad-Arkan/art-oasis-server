const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const port = process.env.PORT || 5000;
const {MongoClient, ServerApiVersion, ObjectId} = require("mongodb");
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);

// middleware
app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({error: true, message: "Unauthorized Access"});
  }
  const token = authorization.split(" ")[1];

  // jwt verify
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res
        .status(401)
        .send({error: true, message: "Unauthorized Access"});
    }
    req.decoded = decoded;
    next();
  });
};

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

    const userCollection = client.db("artOasisDB").collection("users");
    const selectedCollection = client.db("artOasisDB").collection("selected");
    const classCollection = client.db("artOasisDB").collection("classes");
    const paymentCollection = client.db("artOasisDB").collection("payments");

    // jwt verify
    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1hr",
      });
      res.send(token);
    });

    // instructor verify
    const verifyInstructor = async (req, res, next) => {
      const email = req.decoded.email;
      const query = {email: email};
      const user = await userCollection.findOne(query);
      if (user?.role !== "instructor") {
        return res.status(403).send({error: true, message: "Forbidden Access"});
      }
      next();
    };

    // admin verify
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = {email: email};
      const user = await userCollection.findOne(query);
      if (user?.role !== "admin") {
        return res.status(403).send({error: true, message: "Forbidden Access"});
      }
      next();
    };

    // ---------------------------->

    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = {email: user.email};
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({message: "user already exists"});
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.get("/approvedClasses", async (req, res) => {
      const query = {status: "approved"};
      const result = await classCollection
        .find(query)
        .sort({enrolledStudents: -1})
        .toArray();
      res.send(result);
    });

    app.get("/instructors", async (req, res) => {
      const query = {role: "instructor"};
      const result = await userCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/users/student/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        return res.send({student: false});
      }
      const query = {email: email};
      const user = await userCollection.findOne(query);
      const result = {student: user?.role == "student"};
      res.send(result);
    });

    app.get("/users/instructor/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        return res.send({instructor: false});
      }
      const query = {email: email};
      const user = await userCollection.findOne(query);
      const result = {instructor: user?.role == "instructor"};
      res.send(result);
    });

    app.get("/users/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        return res.send({admin: false});
      }
      const query = {email: email};
      const user = await userCollection.findOne(query);
      const result = {admin: user?.role == "admin"};
      res.send(result);
    });

    // ------------------------------->

    // intructor access related api
    app.get(
      "/classes/instructor/:email",
      verifyJWT,
      verifyInstructor,
      async (req, res) => {
        const email = req.params.email;
        const query = {instructorEmail: email};
        const result = await classCollection.find(query).toArray();
        res.send(result);
      }
    );

    app.post("/classes", verifyJWT, verifyInstructor, async (req, res) => {
      const newClass = req.body;
      const result = await classCollection.insertOne(newClass);
      res.send(result);
    });

    app.patch("/class/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const updateClassInfo = req.body;
      const filter = {_id: new ObjectId(id)};
      const updateClass = {
        $set: {
          className: updateClassInfo.className,
          price: updateClassInfo.price,
          availableSeats: updateClassInfo.availableSeats,
        },
      };
      const result = await classCollection.updateOne(filter, updateClass);
      res.send(result);
    });

    // ---------------------------->

    // student access related api
    app.post("/selected/class", verifyJWT, async (req, res) => {
      const selectedClass = req.body;
      const result = await selectedCollection.insertOne(selectedClass);
      res.send(result);
    });

    app.get("/selected/class/:email/:id", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const id = req.params.id;
      const filter = {studentEmail: email, _id: new ObjectId(id)};
      const result = await selectedCollection.findOne(filter);
      res.send(result);
    });

    app.get("/selected/classes/:email", async (req, res) => {
      const email = req.params.email;
      const query = {studentEmail: email};
      const result = await selectedCollection.find(query).toArray();
      res.send(result);
    });

    app.delete("/selected/class/:id", async (req, res) => {
      const id = req.params.id;
      const query = {_id: new ObjectId(id)};
      const result = await selectedCollection.deleteOne(query);
      res.send(result);
    });

    // ------------------------>

    // payment related api
    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const {price} = req.body;
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.post("/payments", verifyJWT, async (req, res) => {
      const payment = req.body;
      const insertResult = await paymentCollection.insertOne(payment);
      // console.log(payment);
      const query = {classId: payment.classId};
      const deleteResult = await selectedCollection.deleteMany(query);

      res.send({insertResult, deleteResult});
    });

    app.get("/payments/enrolled/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const query = {email: email};
      const result = await paymentCollection
        .find(query)
        .sort({date: -1})
        .toArray();
      res.send(result);
    });

    app.patch("/class/updateCount/:classId", async (req, res) => {
      const classId = req.params.classId;
      const filter = {_id: new ObjectId(classId)};
      const classInfo = await classCollection.findOne(filter);
      let enrolledStudents = classInfo.enrolledStudents;
      let availableSeats = classInfo.availableSeats;

      const updateClassInfo = {
        $set: {
          availableSeats: availableSeats - 1,
          enrolledStudents: enrolledStudents + 1,
        },
      };
      await classCollection.updateOne(filter, updateClassInfo);
    });

    // -------------------------->

    // admin access related api
    app.patch("/approve/classes/:id", async (req, res) => {
      const id = req.params.id;
      const filter = {_id: new ObjectId(id)};
      const updateStatus = {
        $set: {
          status: "approved",
        },
      };
      const result = await classCollection.updateOne(filter, updateStatus);
      res.send(result);
    });

    app.patch("/deny/classes/:id", async (req, res) => {
      const id = req.params.id;
      const filter = {_id: new ObjectId(id)};
      const updateStatus = {
        $set: {
          status: "denied",
        },
      };
      const result = await classCollection.updateOne(filter, updateStatus);
      res.send(result);
    });

    app.get("/class/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = {_id: new ObjectId(id)};
      const result = await classCollection.findOne(query);
      res.send(result);
    });

    app.patch("/instructor/class/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const {feedback} = req.body;
      const query = {_id: new ObjectId(id)};
      const updateFeedback = {
        $set: {
          feedback: feedback,
        },
      };
      const result = await classCollection.updateOne(query, updateFeedback);
      res.send(result);
    });

    app.patch("/users/admin/:id", async (req, res) => {
      const id = req.params.id;
      const filter = {_id: new ObjectId(id)};
      const updatedRole = {
        $set: {
          role: "admin",
        },
      };
      const result = await userCollection.updateOne(filter, updatedRole);
      res.send(result);
    });

    app.patch("/users/instructor/:id", async (req, res) => {
      const id = req.params.id;
      const filter = {_id: new ObjectId(id)};
      const updatedRole = {
        $set: {
          role: "instructor",
        },
      };
      const result = await userCollection.updateOne(filter, updatedRole);
      res.send(result);
    });

    // admin state
    app.get("/users", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.get("/classes", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await classCollection.find().toArray();
      res.send(result);
    });

    app.get("/payments", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await paymentCollection.find().toArray();
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
