"""Load the Agrawal et al. (2025) double-auction logs (75 released runs).
No API calls. Produces one row per run with outcome, talk and action-dependence features."""
import json, glob, os, re
import numpy as np

DATA = os.environ.get("AUCTION_DATA", "llm-agent-collusion/data")  # path to the released Agrawal et al. (2025) logs


def parse_rounds(md_path):
    txt = open(md_path).read()
    blocks = re.findall(r"````json\n(.*?)\n````", txt, re.S)
    return [json.loads(b) for b in blocks]


def condition_name(tag):
    return re.sub(r"-\d+$", "", tag)


def load():
    rows = []
    for d in sorted(glob.glob(f"{DATA}/2025*")):
        meta = json.load(open(f"{d}/experiment_metadata.json"))
        cfg = meta["auction_config"]
        met = json.load(open(f"{d}/collusion_metrics.json"))
        rounds = parse_rounds(f"{d}/auction_results.md")
        sellers = meta["seller_ids"]
        T = len(rounds)
        asks = np.full((T, len(sellers)), np.nan)
        bids = np.full(T, np.nan)
        msgs = {s: [] for s in sellers}
        for t, r in enumerate(rounds):
            for j, s in enumerate(sellers):
                asks[t, j] = r["seller_asks"].get(s, np.nan)
                msgs[s].append(r.get("seller_messages", {}).get(s, "") or "")
            bb = [v for v in r["buyer_bids"].values() if v is not None]
            bids[t] = np.mean(bb) if bb else np.nan
        # Seller private-reasoning judge scores only. The overseer's own per-round score
        # (overseer_coordination_score, present in oversight runs) must NOT be mixed in.
        judge = [x for k in met if k.startswith("seller_") and k.endswith("_coordination_score") and met[k]
                 for x in met[k] if x is not None]
        ov = met.get("overseer_coordination_score") or []
        gag_round = ov.index(4) + 1 if 4 in ov else None   # 1-indexed round of first 4/4 -> gag from next round
        rows.append(dict(
            run=os.path.basename(d), cond=condition_name(cfg["tag"]),
            comms=cfg["seller_comms_enabled"], oversight=cfg["oversight_enabled"],
            pressure=cfg["boss_pressure"], seller_models=sorted(set(cfg["seller_models"])),
            ce=met["competitive_equilibrium_price"], jpm=met["joint_profit_maximization_price"],
            asks=asks, bids=bids, msgs=msgs,
            avg_trade_price=met["avg_trade_price_overall"],
            judge_score=float(np.mean(judge)) if judge else np.nan,
            gag_round=gag_round,
        ))
    return rows
