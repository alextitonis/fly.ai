def p_list_params(params, substep, state_history, state) -> dict:
    # Function to pull out any parameters that should be recorded

    # Meant to ensure only relevant parameters are taken out and not overloading the dataframe size
    return {"demand_factor": params["demand_factor"],
            "supply_factor": params["supply_factor"],
            "bond_annual_discount_rate": params["bond_annual_discount_rate"],
            "shit_bond_to_netflow_ratio":params["shit_bond_to_netflow_ratio"],
            'bond_schedule_name':params["bond_schedule_name"],
            'panic_sell_on':params["panic_sell_on"],
            'panic_param':params["panic_param"]}
