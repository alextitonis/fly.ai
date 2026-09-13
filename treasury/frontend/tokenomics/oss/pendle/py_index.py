"""
Python port of PyIndexHarness.sol and SimplifiedMarketMathHarness.sol.
Ported from the Solidity harnesses to be usable in Pyodide/WASM.
Original Solidity: MIT license, Pendle team.
"""

ONE = 1e18
YEAR = 365 * 24 * 3600


class PyIndex:
    """Port of PyIndexHarness.sol — monotonic PY index with high-water floor."""

    def __init__(self, initial_sy_rate: float):
        if initial_sy_rate < 1.0:
            raise ValueError("initial rate below one")
        self.py_index_stored = initial_sy_rate
        self._sy_rate = initial_sy_rate

    def set_sy_exchange_rate(self, rate: float):
        self._sy_rate = rate

    @property
    def sy_exchange_rate(self) -> float:
        return self._sy_rate

    def py_index_current(self) -> float:
        if self._sy_rate > self.py_index_stored:
            return self._sy_rate
        return self.py_index_stored

    def update_py_index(self) -> float:
        current = self.py_index_current()
        self.py_index_stored = current
        return current

    def stress_gap(self) -> float:
        if self.py_index_stored <= self._sy_rate:
            return 0.0
        return self.py_index_stored - self._sy_rate

    def sy_to_py(self, sy_amount: float) -> float:
        return sy_amount * self.py_index_current()

    def py_to_sy(self, py_amount: float) -> float:
        return py_amount / self.py_index_current()


class MarketState:
    """Port of Market struct from SimplifiedMarketMathHarness.sol."""

    def __init__(self, total_pt: float, total_asset: float,
                 rate_scalar: float, rate_anchor: float, time_to_expiry: float):
        if total_pt <= 0:
            raise ValueError("zero totalPt")
        if total_asset <= 0:
            raise ValueError("zero totalAsset")
        if rate_scalar <= 0:
            raise ValueError("zero rateScalar")
        if rate_anchor < 1.0:
            raise ValueError("anchor below one")
        if time_to_expiry <= 0:
            raise ValueError("zero time")
        self.total_pt = total_pt
        self.total_asset = total_asset
        self.rate_scalar = rate_scalar
        self.rate_anchor = rate_anchor
        self.time_to_expiry = time_to_expiry


def get_proportion(total_pt: float, total_asset: float) -> float:
    return total_pt / (total_pt + total_asset)


def get_exchange_rate(market: MarketState) -> float:
    proportion = get_proportion(market.total_pt, market.total_asset)
    slope = proportion / market.rate_scalar
    return market.rate_anchor + slope


def pt_price_from_exchange_rate(exchange_rate: float) -> float:
    if exchange_rate < 1.0:
        raise ValueError("exchange rate below one")
    return 1.0 / exchange_rate


def implied_apy_proxy(exchange_rate: float, time_to_expiry: float) -> float:
    if exchange_rate < 1.0:
        raise ValueError("exchange rate below one")
    if time_to_expiry <= 0:
        raise ValueError("zero time")
    return (exchange_rate - 1.0) * YEAR / time_to_expiry


def get_market_view(market: MarketState) -> dict:
    er = get_exchange_rate(market)
    return {
        'proportion': get_proportion(market.total_pt, market.total_asset),
        'exchange_rate': er,
        'pt_price': pt_price_from_exchange_rate(er),
        'implied_apy': implied_apy_proxy(er, market.time_to_expiry),
    }


def buy_pt(market: MarketState, pt_out: float) -> MarketState:
    if pt_out <= 0:
        raise ValueError("zero ptOut")
    if pt_out >= market.total_pt:
        raise ValueError("insufficient PT")
    return MarketState(
        market.total_pt - pt_out,
        market.total_asset,
        market.rate_scalar,
        market.rate_anchor,
        market.time_to_expiry,
    )


def sell_pt(market: MarketState, pt_in: float) -> MarketState:
    if pt_in <= 0:
        raise ValueError("zero ptIn")
    return MarketState(
        market.total_pt + pt_in,
        market.total_asset,
        market.rate_scalar,
        market.rate_anchor,
        market.time_to_expiry,
    )
