from types import SimpleNamespace

from hermes_screener.trading.protocol_liquidity_executor import ProtocolLiquidityExecutor


class _FakeFn:
    def __init__(self):
        self.last_tx = None

    def build_transaction(self, tx):
        self.last_tx = tx
        return tx


class _FakeContractObj:
    def __init__(self):
        self._token0 = "0x1111111111111111111111111111111111111111"
        self._token1 = "0x2222222222222222222222222222222222222222"

    class _Call:
        def __init__(self, value):
            self.value = value

        def call(self):
            return self.value

    class _MintCall:
        def __init__(self):
            self.fn = _FakeFn()

        def build_transaction(self, tx):
            return tx

    @property
    def functions(self):
        obj = self

        class F:
            def token0(self_inner):
                return _FakeContractObj._Call(obj._token0)

            def token1(self_inner):
                return _FakeContractObj._Call(obj._token1)

            def mint(self_inner, *_args):
                return _FakeFn()

            def getMintAmounts(self_inner, *_args):
                return _FakeContractObj._Call((1, 1, 10))

            def deposit(self_inner, *_args):
                return _FakeFn()

        return F()


class _FakeEth:
    def __init__(self):
        self.gas_price = 1
        self.max_priority_fee = 1

    def get_transaction_count(self, *_args, **_kwargs):
        return 1

    def send_raw_transaction(self, *_args, **_kwargs):
        class _Hash:
            def hex(self):
                return "0xabc"

        return _Hash()

    def wait_for_transaction_receipt(self, *_args, **_kwargs):
        return SimpleNamespace(status=1)

    def contract(self, *args, **kwargs):
        return _FakeContractObj()


class _FakeW3:
    def __init__(self):
        self.eth = _FakeEth()


class _FakeAccount:
    address = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

    def sign_transaction(self, tx):
        return SimpleNamespace(raw_transaction=b"raw")


class _FakeContractExecutor:
    def __init__(self):
        self.w3 = _FakeW3()
        self.account = _FakeAccount()
        self.approvals = []

    def approve_token(self, token, spender, amount):
        self.approvals.append((token, spender, amount))
        return "ok"


class _FakeTrader:
    def __init__(self):
        self.contract_executor = _FakeContractExecutor()


def test_missing_target_returns_false(tmp_path):
    ex = ProtocolLiquidityExecutor(_FakeTrader(), live_deploy=False)
    ex.targets_path = tmp_path / "targets.json"
    out = ex.execute_deploy_action({"details": {"opportunity_id": "missing"}})
    assert out is False


def test_kamino_dryrun_true(tmp_path):
    ex = ProtocolLiquidityExecutor(_FakeTrader(), live_deploy=False)
    ex.targets_path = tmp_path / "targets.json"
    ex.targets_path.write_text('[{"id":"kamino-sol-usdc","protocol":"kamino","chain":"solana","strategy":"abc"}]')
    out = ex.execute_deploy_action(
        {
            "protocol": "kamino",
            "details": {
                "opportunity_id": "kamino-sol-usdc",
                "deposit_token": "SOL",
                "deposit_amount": 1.5,
            },
        }
    )
    assert out is True
