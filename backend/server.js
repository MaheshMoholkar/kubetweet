const express = require("express");
require("dotenv").config();
const cors = require("cors");
const supabase = require("./config");
const TwitterApi = require("twitter-api-v2").default;

const app = express();
const port = 5000;

// Api can be only accessible from these origins
// after deployment, add the Deployed frontend Url here
const whitelist = [
  "http://localhost:5000",
  "http://127.0.0.1:5000",
  "http://localhost:3000",
];
const corsOptions = {
  origin: function (origin, callback) {
    if (whitelist.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
};

app.use(cors(corsOptions));

const twitterClient = new TwitterApi({
  clientId: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
});

const readTwitterClient = new TwitterApi(process.env.BEARER_TOKEN);


// you have to enter the callback Url in twitter developer portal  before accessing below endpoints
const callbackURL = "http://127.0.0.1:5000/callback";

app.get("/", (req, res) => {
  res.send("Hello World");
});


app.get("/auth", async (req, res) => {
  // to generate the OAuth2.0 Link with these permissions and get the state and codeverifier token
  const { url, codeVerifier, state } = twitterClient.generateOAuth2AuthLink(
    callbackURL,
    { scope: ["tweet.read", "tweet.write", "users.read", "offline.access"] }
  );

  // store both the code and codeverifier code on supabase database
  const { data, error } = await supabase
    .from("states")
    .update({ statecode: state, code_verifier: codeVerifier })
    .eq("id", "1")
    .single();

  // After authorisation, redirect the user to callback Url to generate access and refresh token
  res.redirect(url);
});

app.get("/callback", async (req, res) => {
  // take the state and code-verifier token from the auth callback url
  const { state, code } = req.query;

  // get the state and codeverifier token from DB
  const { data: states, error } = await supabase
    .from("states")
    .select("*")
    .single();
  const { statecode, code_verifier } = states;
  console.log(states);

  // Check the state from url and state from DB match
  if (state !== statecode) {
    return res.status(400).send("Stored tokens didn't match!");
  }

  // Generate accessToken and refreshToken by logging with the state and verifier codes
  const {
    client: loggedClient,
    accessToken,
    refreshToken,
  } = await twitterClient.loginWithOAuth2({
    code,
    codeVerifier: code_verifier,
    redirectUri: callbackURL,
  });

  // Store the accessToken and refreshToken to DB
  const { data: updatedData, error: error1 } = await supabase
    .from("tokens")
    .update({ Access_tokens: accessToken, Refresh_Tokens: refreshToken })
    .eq("id", "1")
    .single();

  console.log(updatedData);

  const { data } = await loggedClient.v2.me();

  res.send(data);
});

app.get("/tweet", async (req, res) => {
  // take the old accessToken and refreshToken from DB
  let { data: tokens, error } = await supabase
    .from("tokens")
    .select("*")
    .single();
  const { Refresh_Tokens } = tokens;
  console.log("status  : " + Refresh_Tokens);

  // Generate new Refresh token using old refresh token
  const {
    client: refreshedClient,
    accessToken,
    refreshToken: newRefreshToken,
  } = await twitterClient.refreshOAuth2Token(Refresh_Tokens);
  console.log("status refreshed clint");

  // Update the refresh accessToken and newRefreshToken in DB
  const { data: updatedData, error: error1 } = await supabase
    .from("tokens")
    .update({ Access_tokens: accessToken, Refresh_Tokens: newRefreshToken })
    .eq("id", "1")
    .single();

  // Take the tweet text from request
  const { text } = req.query;
  console.log(text);

  // tweet with text
  const { data } = await refreshedClient.v2.tweet(text);
  console.log("Tweeted succesfully");
  res.send(data);
});

app.get("/retweet", async (req, res) => {
  // take the old accessToken and refreshToken from DB
  let { data: tokens, error } = await supabase
    .from("tokens")
    .select("*")
    .single();
  const { Refresh_Tokens } = tokens;

  // Generate new Refresh token using old refresh token
  const {
    client: refreshedClient,
    accessToken,
    refreshToken: newRefreshToken,
  } = await twitterClient.refreshOAuth2Token(Refresh_Tokens);

  // Update the refresh accessToken and newRefreshToken in DB
  const { data: updatedData, error: error1 } = await supabase
    .from("tokens")
    .update({ Access_tokens: accessToken, Refresh_Tokens: newRefreshToken })
    .eq("id", "1")
    .single();

  // Take the TweetId and Retweet the tweet
  const { id } = req.query;
  const { data } = await refreshedClient.v2.retweet("1065215380157841408", id);

  console.log("Retweeted succesfully");
  res.send(data);
});

app.get("/getTweet", async (req, res) => {
  const { id } = req.query;
  // const id = "1573134820435447808"
  const data = await readTwitterClient.v2.singleTweet(id);
  console.log(data);
  res.send(data);
  console.log("get tweet run successfully");
});

app.get("/schedule", async (req, res) => {

  const { text, scheduleDate } = req.query;
  console.log(scheduleDate);
  // const scheduleDate = '9/27/2022, 7:24:10 AM'

  const schedule = setInterval(() => {
    const nDate = new Date().toLocaleString("en-US", {
      timeZone: "Asia/Calcutta",
    });
    const scheduletweet = async () => {
      let { data: tokens, error } = await supabase
        .from("tokens")
        .select("*")
        .single();
      const { Refresh_Tokens } = tokens;
      console.log("status  : " + Refresh_Tokens);

      const {
        client: refreshedClient,
        accessToken,
        refreshToken: newRefreshToken,
      } = await twitterClient.refreshOAuth2Token(Refresh_Tokens);
      console.log("status refreshed clint");

      const { data: updatedData, error: error1 } = await supabase
        .from("tokens")
        .update({
          Access_tokens: accessToken,
          Refresh_Tokens: newRefreshToken,
        })
        .eq("id", "1")
        .single();
     
      const { data } = await refreshedClient.v2.tweet(text);
      console.log("tweeted succesfully");
    };
    if (scheduleDate === nDate) {
      scheduletweet();
      clearInterval(schedule);
    }
  }, 1000);
  res.send("Your tweet has scheduled on " + scheduleDate);
});

app.get("/thread", async (req, res) => {
  // take the old accessToken and refreshToken from DB
  let { data: tokens, error } = await supabase
    .from("tokens")
    .select("*")
    .single();
  const { Refresh_Tokens } = tokens;

  // Generate new Refresh token using old refresh token
  const {
    client: refreshedClient,
    accessToken,
    refreshToken: newRefreshToken,
  } = await twitterClient.refreshOAuth2Token(Refresh_Tokens);

  // Update the refresh accessToken and newRefreshToken in DB
  const { data: updatedData, error: error1 } = await supabase
    .from("tokens")
    .update({ Access_tokens: accessToken, Refresh_Tokens: newRefreshToken })
    .eq("id", "1")
    .single();
  // const { text } = req.query;

  const { data } = await refreshedClient.v2.tweetThread([
    "Hello, lets talk about Twitter!",
    "Twitter is a fantastic social network. Look at this:",
    "This thread is automatically made with twitter-api-v2 :D",
  ]);
  console.log(data);
  console.log("tweeted succesfully");
  res.send(data);
});

app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});
