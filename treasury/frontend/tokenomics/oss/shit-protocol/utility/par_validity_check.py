def shitbond_check(params,initialstate,safety_ratio=0.5):
    # this function checks whether the initial bond schedule may give too much pressure to the market
    # NOTE: this is not absolutely safe!! we are not really considering if more than one bonds expires in one day, plus the system state will be different at the time it expires
    for allbonds in params['bond_create_schedule']: # iterate over each parameter sweep set of bonds

        liq_shit = initialstate['liq_shit']
        allgood = True
        for kr,row in allbonds.iterrows():
            for bond in row['bonds']:
                if bond.total_amount> (safety_ratio * liq_shit):
                    allgood = False
                    print('Amount too big: ')
                    print(bond)
        if allgood:
            print(f'no bonds exceeds the initial check amount ({safety_ratio *liq_shit:.1f} SHIT)')
