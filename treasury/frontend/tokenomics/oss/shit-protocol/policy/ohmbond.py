from ..types.compound import SHITbond
import pandas as pd

def generate_shitbond(amounts=[[1e6]],exp_durs=[[30]],start_days=[1]):
    allbonds = {'start_days':[],'bonds':[]}
    for kd,day in enumerate(start_days):
        allbonds['start_days'].append(day)
        bonds_today = []
        for amount,exp_dur in zip(amounts[kd],exp_durs[kd]):
            bond = SHITbond(total_amount=amount,expiration_duration=exp_dur,start_date=day)
            bonds_today.append(bond)
        allbonds['bonds'].append( bonds_today)
    return pd.DataFrame(allbonds)

