import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BUDGET_CAP_SECONDS, MODE_DURATIONS, appendSession, checkGuard, computeUsedSeconds, loadLedger } from "./budget.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEDGER_PATH = path.join(__dirname, "sessions.log.json");
const TAVUS_BASE = "https://tavusapi.com/v2";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/api/usage", (req, res) => {
  const sessions = loadLedger(LEDGER_PATH);
  const usedSeconds = computeUsedSeconds(sessions);
  res.json({ usedSeconds, remainingSeconds: 1500 - usedSeconds, sessions });
});

app.post("/api/sessions", async (req, res) => {
  const { mode, targetRole, force } = req.body || {};
  if (mode !== "dev" && mode !== "full") {
    return res.status(400).json({ error: "mode must be 'dev' or 'full'" });
  }

  const sessions = loadLedger(LEDGER_PATH);
  const { allowed, usedSeconds } = checkGuard(sessions, Boolean(force));
  if (!allowed) {
    return res.status(429).json({ error: `Budget guard: ${usedSeconds}s used, cap is ${BUDGET_CAP_SECONDS}s. Pass force:true to override.`, usedSeconds });
  }

  const maxCallDuration = MODE_DURATIONS[mode];
  const body = {
    pal_id: process.env.TAVUS_PAL_ID,
    conversation_name: `rehearsal-${new Date().toISOString()}`,
    properties: {
      max_call_duration: maxCallDuration,
      participant_left_timeout: 15,
      participant_absent_timeout: 60,
    },
  };
  if (targetRole) {
    body.conversational_context = `The candidate's target role is: ${targetRole}`;
  }

  let tavusRes, tavusData;
  try {
    tavusRes = await fetch(`${TAVUS_BASE}/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.TAVUS_API_KEY },
      body: JSON.stringify(body),
    });
    tavusData = await tavusRes.json();
  } catch (err) {
    return res.status(502).json({ error: `Tavus request failed: ${err.message}` });
  }

  if (!tavusRes.ok) {
    return res.status(tavusRes.status).json(tavusData);
  }

  const updated = appendSession(LEDGER_PATH, {
    ts: new Date().toISOString(),
    mode,
    reservedSeconds: maxCallDuration,
    conversation_id: tavusData.conversation_id,
  });
  const newUsedSeconds = computeUsedSeconds(updated);

  res.json({
    conversation_url: tavusData.conversation_url,
    conversation_id: tavusData.conversation_id,
    usedSeconds: newUsedSeconds,
    remainingSeconds: 1500 - newUsedSeconds,
  });
});

app.post("/api/sessions/:id/end", async (req, res) => {
  try {
    const tavusRes = await fetch(`${TAVUS_BASE}/conversations/${req.params.id}/end`, {
      method: "POST",
      headers: { "x-api-key": process.env.TAVUS_API_KEY },
    });
    const data = tavusRes.status === 204 ? {} : await tavusRes.json();
    res.status(tavusRes.status).json(data);
  } catch (err) {
    res.status(502).json({ error: `Tavus request failed: ${err.message}` });
  }
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => {
  console.log(`agora-interview-coach server listening on :${PORT}`);
});
