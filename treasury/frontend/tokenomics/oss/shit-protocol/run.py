import pandas as pd
import numpy as np
from .psub import psub_blocks, psub_blocks_soros,psub_blocks_noRBS
from cadCAD.engine import ExecutionMode, ExecutionContext, Executor
from cadCAD import configs
from cadCAD.configuration.utils import config_sim
from cadCAD.configuration import Experiment
from copy import deepcopy
from typing import Tuple, Any, Dict, List, Callable



def load_config(monte_carlo_runs: int, params, initial_state, t, psub_scenario_option=None):
    sim_config = config_sim({
        'N': monte_carlo_runs,  # number of monte carlo runs
        'T': list(range(t)),  # number of timesteps
        'M': params             # simulation parameters
    })

    # Switch to special sets of psubs
    if psub_scenario_option == "Soros":
        blocks = psub_blocks_soros
    elif psub_scenario_option == "NoRBS":
        blocks = psub_blocks_noRBS
    else:
        blocks = psub_blocks

    exp = Experiment()
    exp.append_configs(
        sim_configs=sim_config,
        initial_state=initial_state,
        partial_state_update_blocks=blocks
    )
    return exp


def add_config(exp: Experiment, monte_carlo_runs: int, params, initial_state, t):
    sim_config = config_sim({
        'N': monte_carlo_runs,  # number of monte carlo runs
        'T': list(range(t)),  # number of timesteps
        'M': params             # simulation parameters
    })

    exp.append_configs(
        sim_configs=sim_config,
        initial_state=initial_state,
        partial_state_update_blocks=psub_blocks
    )


def run(exp) -> pd.DataFrame:
    """
    Run simulation
    """
    # execute in local mode
    exec_mode = ExecutionMode()
    local_mode_ctx = ExecutionContext(context=exec_mode.local_mode)

    sim = Executor(exec_context=local_mode_ctx, configs=exp.configs)
    raw_system_events, _, _ = sim.execute()
    df = pd.DataFrame(raw_system_events)
    return df



def post_processing(raw) -> pd.DataFrame:
    # Pull only the final substep
    df = raw.groupby(["simulation", "subset", "run",
                     "timestep"]).last().reset_index()

    # Counter values
    df["control_ask"] = df["ask_counter"].apply(lambda x: sum(x))
    df["control_bid"] = df["bid_counter"].apply(lambda x: sum(x))

    # Add a unique ID to make grouping easier
    df["unique_id"] = df["simulation"].astype(
        str) + "-" + df["subset"].astype(str) + "-" + df["run"].astype(str)

    # Backfill parameter values
    df[["demand_factor", "supply_factor", "bond_annual_discount_rate", "shit_bond_to_netflow_ratio"]] = df[[
        "demand_factor", "supply_factor", "bond_annual_discount_rate", "shit_bond_to_netflow_ratio"]].fillna(method="bfill")

    return df

from cadCAD.utils import flatten
from cadCAD.utils.execution import print_exec_info
from cadCAD.configuration import Configuration, Processor
from cadCAD.configuration.utils import TensorFieldReport, configs_as_objs, configs_as_dicts
from cadCAD.engine.execution import single_proc_exec, parallelize_simulations, local_simulations
from time import time
from cadCAD.engine.simulation import Executor as SimExecutor

def new_run(exp)-> pd.DataFrame:
    """
    Run simulation, but allowing interruption
    """
    SimExecutor.run_pipeline = new_run_pipeline

    Executor.SimExecutor = SimExecutor
    Executor.execute = new_execute

    # execute in local mode
    exec_mode = ExecutionMode()
    local_mode_ctx = ExecutionContext(context=exec_mode.local_mode)
    Executor.run_pipeline = new_run_pipeline
    sim = Executor(exec_context=local_mode_ctx, configs=exp.configs)
    raw_system_events, _, _ = sim.execute()
    df = pd.DataFrame(raw_system_events)
    return df


def new_run_pipeline(
        self,
        sweep_dict: Dict[str, List[Any]],
        states_list: List[Dict[str, Any]],
        configs: List[Tuple[List[Callable], List[Callable]]],
        env_processes: Dict[str, Callable],
        time_seq: range,
        run: int,
        additional_objs
    ) -> List[List[Dict[str, Any]]]:
        time_seq: List[int] = [x + 1 for x in time_seq]
        simulation_list: List[List[Dict[str, Any]]] = [states_list]

        for time_step in time_seq:
            
            last_state = simulation_list[-1]
            
            pipe_run: List[Dict[str, Any]] = self.state_update_pipeline(
                sweep_dict, simulation_list, configs, env_processes, time_step, run, additional_objs
            )
            _, *pipe_run = pipe_run
            simulation_list.append(pipe_run)
            
            
            #print(f"{time_step}, {pipe_run}, {sweep_dict}")
            do_stop = pipe_run[-1].get('interrupt', False)
            if do_stop:
                break

        return simulation_list

def new_execute(self) -> Tuple[Any, Any, Dict[str, Any]]:
        if self.empty_return is True:
            return [], [], []

        config_proc = Processor()
        create_tensor_field = TensorFieldReport(config_proc).create_tensor_field

        sessions = []
        var_dict_list, states_lists = [], []
        Ts, Ns, SimIDs, RunIDs = [], [], [], []
        ExpIDs, ExpWindows, SubsetIDs, SubsetWindows = [], [], [], []
        eps, configs_structs, env_processes_list = [], [], []
        partial_state_updates, sim_executors = [], []
        config_idx = 0

        # Execution Info
        print_exec_info(self.exec_context, configs_as_objs(self.configs))

        t1 = time()
        for x in self.configs:
            sessions.append(
                {
                    'user_id': x.user_id, 'experiment_id': x.experiment_id, 'session_id': x.session_id,
                    'simulation_id': x.simulation_id, 'run_id': x.run_id,
                    'subset_id': x.subset_id, 'subset_window': x.subset_window
                }
            )
            Ts.append(x.sim_config['T'])
            Ns.append(x.sim_config['N'])

            ExpIDs.append(x.experiment_id)
            ExpWindows.append(x.exp_window)
            SimIDs.append(x.simulation_id)
            SubsetIDs.append(x.subset_id)
            RunIDs.append(x.run_id)
            SubsetWindows.append(x.subset_window)

            var_dict_list.append(x.sim_config['M'])
            states_lists.append([x.initial_state])
            eps.append(list(x.exogenous_states.values()))
            configs_structs.append(config_proc.generate_config(x.initial_state, x.partial_state_update_blocks, eps[config_idx]))
            env_processes_list.append(x.env_processes)
            partial_state_updates.append(x.partial_state_update_blocks)
            sim_executors.append(self.SimExecutor(x.policy_ops).simulation)

            config_idx += 1

        def get_final_dist_results(simulations, psus, eps, sessions):
            tensor_fields = [create_tensor_field(psu, ep) for psu, ep in list(zip(psus, eps))]
            return simulations, tensor_fields, sessions

        def get_final_results(simulations, psus, eps, sessions, remote_threshold):
            flat_timesteps, tensor_fields = [], []
            for sim_result, psu, ep in list(zip(simulations, psus, eps)):
                flat_timesteps.append(flatten(sim_result))
                tensor_fields.append(create_tensor_field(psu, ep))

            flat_simulations = flatten(flat_timesteps)
            if config_amt == 1:
                return simulations, tensor_fields, sessions
            elif config_amt > 1:
                return flat_simulations, tensor_fields, sessions

        remote_threshold = 100
        config_amt = len(self.configs)

        def auto_mode_switcher(config_amt):
            try:
                if config_amt == 1:
                    return ExecutionMode.single_mode, single_proc_exec
                elif (config_amt > 1):
                    return ExecutionMode.multi_mode, parallelize_simulations
            except AttributeError:
                if config_amt < 1:
                    raise ValueError('N must be >= 1!')

        final_result = None
        original_N = len(configs_as_dicts(self.configs))
        if self.exec_context != ExecutionMode.distributed:
            # Consider Legacy Support
            if self.exec_context != ExecutionMode.local_mode:
                self.exec_context, self.exec_method = auto_mode_switcher(config_amt)

            print("Execution Method: " + self.exec_method.__name__)
            simulations_results = self.exec_method(
                sim_executors, var_dict_list, states_lists, configs_structs, env_processes_list, Ts, SimIDs, RunIDs,
                ExpIDs, SubsetIDs, SubsetWindows, original_N
            )

            final_result = get_final_results(simulations_results, partial_state_updates, eps, sessions, remote_threshold)
        elif self.exec_context == ExecutionMode.distributed:
            print("Execution Method: " + self.exec_method.__name__)
            simulations_results = self.exec_method(
                sim_executors, var_dict_list, states_lists, configs_structs, env_processes_list, Ts,
                SimIDs, RunIDs, ExpIDs, SubsetIDs, SubsetWindows, original_N, self.sc
            )
            final_result = get_final_dist_results(simulations_results, partial_state_updates, eps, sessions)

        t2 = time()
        print(f"Total execution time: {t2 - t1 :.2f}s")

        return final_result
