"""
Provides the `Strategy` class which stores the metrics
and runs the scenario.
"""
from typing import List, Type
from .scenario import Scenario
from .processing import SingleSimProcessor
from .results import SingleSimResults
from ..metrics import Metric
from ..logging import get_logger

logger = get_logger(__name__)


# pylint: disable=too-few-public-methods
class Strategy:
    """
    Strategy stores the metrics and runs the simulation.
    """

    def __init__(self, metrics: List[Type[Metric]]):
        self.metrics = metrics

    def __call__(
        self,
        scenario: Scenario,
        i: int | None = None,
    ) -> SingleSimResults:
        """
        Runs the scenario.
        """
        logger.info("STARTING new simulation %d", i)

        scenario.generate_pricepaths()  # produce new stochastic prices

        scenario.prepare_for_run()

        processor = SingleSimProcessor(scenario, self.metrics)

        for sample in scenario.pricepaths:
            scenario.prepare_for_trades(sample)
            scenario.perform_actions(sample)
            processor.update(sample.timestamp, inplace=True)

        logger.info("DONE with simulation %d", i)

        return processor.process()
