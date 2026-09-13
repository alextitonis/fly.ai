from itertools import product
from copy import deepcopy
from ..types.config import ParamsType


def create_par_sweep(sweep_dict: dict) -> dict:
    """This function takes a dictionary where key is parameter name
    and value is a list of all possible values for that parameter. It
    converts this into a dictionary with the same keys but with values
    that are the cartesian product of all the lists.

    Args:
        sweep_dict (dict): A dictionary of params and values to sweep over

    Returns:
        dict: A dictionary of cartesian product params
    """
    # Copy sweep_dict to avoid overwriting
    sweep_dict = deepcopy(sweep_dict)

    # Get the cartesian product
    sweeps = list(product(*sweep_dict.values()))

    # Assign values
    for kk, varname in enumerate(sweep_dict.keys()):
        sweep_dict[varname] = [x[kk] for x in sweeps]

    return sweep_dict


def create_par_sweep_and_apply(sweep_dict: dict, params: ParamsType) -> None:
    """Create the cartesian parameter sweep dictionary and then overwrite the values
    for params

    Args:
        sweep_dict (dict): A dictionary of params and values to sweep over
        params (ParamsType): The parameters of the system
    """

    # Get the param sweep
    sweep_dict = create_par_sweep(sweep_dict)

    # Update params
    for key in sweep_dict.keys():
        params[key] = sweep_dict[key]

# ----------below are functions for notating the parameter sweep after the experiment has been done and dataframe has been generated
def get_simu_names(sweep_par_dict):
    simu_names = []
    for ksimu in range(len(sweep_par_dict['bid_factor'])):
        name = ''
        for key,vals in sweep_par_dict.items():
            name += key +':'+str(vals[ksimu])+', '
        simu_names.append(name[:-2])
    return simu_names
def add_simuname_to_df(df,sweep_par_dict):
    newdf = df.copy()
    simunames = get_simu_names(sweep_par_dict)
    newdf['simu_name'] = newdf['unique_id'].apply(lambda x:simunames[int(x.split('-')[1])])
    return newdf
def add_sweep_par_to_df(df,sweep_par_dict):
    newdf = df.copy()
    for key,vals in sweep_par_dict.items():
        par_var_list = df['unique_id'].apply(lambda x:sweep_par_dict[key][int(x.split('-')[1])])
        newdf[key] = par_var_list
    return newdf