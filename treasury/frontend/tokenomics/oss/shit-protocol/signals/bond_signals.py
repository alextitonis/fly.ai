from pandas import DataFrame
from ..types.primitives import day, SHIT
from typing import List
from ..policy.shitbond import generate_shitbond
import numpy as np
def total_value_bond_creation(start_dates,simulation_timesteps:day, bond_tenors,total_face_value:SHIT,bond_value_distribution:List=[])->DataFrame:
    """Creates a signal of bond creations where the total amount of bond face value is fixed, distributed into each bond
    Args:
        start_dates (day, or List[day]): The time for each bond to start selling. All bonds can start at the same date or different (specified by a list of numbers). If both bond_tenors and start_dates are List, they should have equal length.
        simulation_timesteps (day): The number of timesteps the simulation has. The starting dates should not exceed total simulation time step
        bond_tenors (day, or List[day]): The tenors for the bonds to create. The tenors can all be the same or different (specified by a list of numbers). If both bond_tenors and start_dates are List, they should have equal length.
        total_face_value (SHIT): The total face value of all bonds cated.
        bond_value_distribution (list): the ratio of face value between all the bonds. empty list means the total value is evenly distributed across all bonds
        

    Returns:
        DataFrame: A DataFrame of bonds to be created and the time at which they will be created
    """

    if type(start_dates) is list: 
        # first, check parameter validity
        assert max(start_dates) < simulation_timesteps, "start dates should be smaller than simulation_timesteps"
        if bond_tenors is list:
            assert (len(start_dates)==len(bond_tenors)),"start_dates should have the same length as bond_tenors"
        else: # all bonds have the same tenors
            bond_tenors = np.ones_like(start_dates)*bond_tenors
        
        # now, start assembly bonds
        if len(bond_value_distribution)==0:
            bond_value_distribution = np.ones_like(bond_tenors)
        bond_values = total_face_value * np.array(bond_value_distribution)/sum(bond_value_distribution)
        bonds = generate_shitbond(amounts=[[k] for k in bond_values],
                             exp_durs=[[k] for k in bond_tenors], start_days=start_dates)
    else: # all bonds start at the same times
        assert start_dates < simulation_timesteps, "start dates should be smaller than simulation_timesteps"
        if type(bond_tenors) is list:
            if len(bond_value_distribution)==0:
                bond_value_distribution = np.ones_like(bond_tenors)
            bond_values = total_face_value * np.array(bond_value_distribution)/sum(bond_value_distribution)
            bonds = generate_shitbond(amounts=[bond_values],exp_durs=[bond_tenors], start_days=[start_dates])
        else: # only one bond
            bonds = generate_shitbond(amounts=[[total_face_value]],exp_durs=[[bond_tenors]], start_days=[start_dates])
    
    return bonds


def periodic_bond_creation(period: day, bond_tenors: List[day], face_value: SHIT, simulation_timesteps: day) -> DataFrame:
    """Creates a signal of bond creations where every number of days (period),
    bonds of all tenors listed will be created all with the same face value specified

    Args:
        period (day): The periodic number of days for bond creation
        bond_tenors (List[day]): The tenors for the bonds to create
        face_value (SHIT): The face value that all bonds will have
        simulation_timesteps (day): The number of timesteps the simulation has

    Returns:
        DataFrame: A DataFrame of bonds to be created and the time at which they will be created
    """
    # List of start times for bond release
    start_times = list(range(1, simulation_timesteps, period))

    # The face values that the bonds will have
    face_value_temp = [[face_value] * len(bond_tenors)] * len(start_times)

    # The tenors that the bonds will have
    bond_tenors_temp = [bond_tenors] * len(start_times)

    # Generate the bonds
    bonds = generate_shitbond(amounts=face_value_temp,
                             exp_durs=bond_tenors_temp, start_days=start_times)

    return bonds


def period_bond_creation_normal_dist(period: day, bond_tenors: List[day], face_value_mu: SHIT, face_value_std: SHIT, simulation_timesteps: day) -> DataFrame:
    """Creates a signal of bond creations where every number of days (period),
    bonds of all tenors listed will be created all with a face value pulled
    from the normal distribution governed by the parameters for face_value_mu,
    and face_value_std

    Args:
        period (day): The periodic number of days for bond creation
        bond_tenors (List[day]): The tenors for the bonds to create
        face_value_mu (SHIT): The average face value of the bonds
        face_value_std (SHIT): The standard deviation of the face value of bonds
        simulation_timesteps (day): The number of timesteps the simulation has

    Returns:
        DataFrame: A DataFrame of bonds to be created and the time at which they will be created
    """
    # List of start times for bond release
    start_times = list(range(1, simulation_timesteps, period))

    # Face values the bonds will have pulled from a normal distribution
    face_value_temp = np.random.normal(
        face_value_mu, face_value_std, (len(start_times), len(bond_tenors)))
    assert face_value_temp.min(
    ) >= 0, "There was a negative value for face value, check the parameters"

    # Convert the numpy array to a list
    face_value_temp = face_value_temp.tolist()

    # The tenors the bonds will have
    bond_tenors_temp = [bond_tenors] * len(start_times)

    # Create the bonds
    bonds = generate_shitbond(amounts=face_value_temp,
                             exp_durs=bond_tenors_temp, start_days=start_times)

    return bonds
