import json

from perps_arb.store import JsonlStateStore


def _append(path, obj):
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(obj) + "\n")


def test_load_open_positions_filters_closed_symbols(tmp_path):
    store = JsonlStateStore(base_dir=str(tmp_path / "data"))

    _append(store.exec_path, {
        "symbol": "BTC/USDT:USDT",
        "short_exchange": "dex_a",
        "long_exchange": "dex_b",
        "notional": 1000,
    })
    _append(store.exec_path, {
        "symbol": "ETH/USDT:USDT",
        "short_exchange": "dex_a",
        "long_exchange": "dex_b",
        "notional": 800,
    })
    _append(store.close_path, {"symbol": "BTC/USDT:USDT"})

    open_positions = store.load_open_positions()

    assert len(open_positions) == 1
    assert open_positions[0]["symbol"] == "ETH/USDT:USDT"


def test_load_open_positions_tolerates_corrupt_jsonl_lines(tmp_path):
    store = JsonlStateStore(base_dir=str(tmp_path / "data"))

    with store.exec_path.open("w", encoding="utf-8") as f:
        f.write('{"symbol":"BTC/USDT:USDT","short_exchange":"dex_a","long_exchange":"dex_b","notional":1000}\n')
        f.write('{this-is-not-json}\n')

    open_positions = store.load_open_positions()

    assert len(open_positions) == 1
    assert open_positions[0]["symbol"] == "BTC/USDT:USDT"
