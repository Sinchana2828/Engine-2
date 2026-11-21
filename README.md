# Engine 2 — Logic & Rule (Member 2)

## Purpose
Owns the **business logic and decision rules**: repair-vs-replace analysis, risk scoring, ranking, repair processing and AI image classification of appliances.

## Contents
| Path | What it does |
|---|---|
| `server/services/DecisionEngine.js` | Recommends *Repair / Continue Monitoring / Consider Replacement* with reasons. Rules: maintenance spend > 50% of price → replace; age ≥ 10 yrs → replace; spend > 25% and age > 5 → monitor; otherwise repair |
| `server/services/CostAnalyzer.js` | **50% Rule**: repair quote ÷ replacement cost ≥ 50% → replace; also flags age ≥ 7 yrs with ratio > 35% |
| `server/services/RankingEngine.js` | Keyword search + failure-risk score (0–100): age (max 40) + repair count (max 30) + cost ratio (max 30); ranks by urgency |
| `server/controllers/applianceController.js` | Dashboard summary, appliance CRUD, add repair, image upload, and **CLIP-based AI classification** (`/ai-classify`) for 11 appliance categories |
| `server/controllers/repairController.js` | Repair CRUD, listing/filtering and cost aggregation |
| `server/scripts/download_clip.mjs`, `download_model.mjs` | Download the local CLIP/ViT models (offline classification) |
| `server/scripts/optimize_prompts.mjs` | Tunes the text prompts used by the classifier |

## Key rules at a glance
- **50% Replacement Rule** (repair cost vs replacement benchmark = purchase price × 1.15 if none given)
- Risk score weights: age 5 pts/yr (cap 40), repairs 15 pts each (cap 30), cost ratio ×50 (cap 30)

## Interfaces with other engines
- Uses `models/Appliance.js` (Engine 1) for data.
- Exposed through `routes/` (Engine 3); results displayed in the dashboard & Search/Ranking views.
- Verified by Engine 4 (`test_classification_engine.js`, `test_accuracy_and_catalog.js`).
- Needs `npm install` for `@xenova/transformers`, `sharp`, `mongoose` (see Engine 3's `server/package.json`; add `sharp` if missing).

---

## Project
**AI-Assisted Appliance Repair & Replacement Decision Support System** — Final-Year BCA Project (Theme 3: Search and Ranking System).
Stack: React 18 + Vite (client) · Node.js + Express (server) · MongoDB + Mongoose · JWT auth.

## How the 4 engines fit together
| Engine | Owner | Responsibility |
|---|---|---|
| Engine 1 | Member 1 | Data & Integrity |
| Engine 2 | Member 2 | Logic & Rule |
| Engine 3 | Member 3 | Interface & Access |
| Engine 4 | Member 4 | Testing & Validation |

To run the **complete** application, extract all 4 zips into one folder and merge them (the folder structure `client/` and `server/` is identical in every zip, so merging just combines files). Then:

```bash
cd server && npm install        # backend deps
cd ../client && npm install     # frontend deps
# create server/.env  ->  PORT=5000, MONGODB_URI=mongodb://127.0.0.1:27017/appliance_decision_db, JWT_SECRET=<your secret>, CLIENT_URL=http://localhost:5173
cd server && npm start          # API on :5000
cd client && npm run dev        # UI on :5173
```
> `.env` is intentionally NOT included in the zips (it contains secrets). Use `.env.example` as a template.
