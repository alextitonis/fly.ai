import numpy as np
import pandas as pd
# KPI 0: pool drained
def fun_pooldrained(df,totalstep = 100)->list:
    pooldrained = []
    for unique_id in df['unique_id'].unique():
        subdf = df.loc[df['unique_id']==unique_id]
        if len(subdf)<totalstep:
            pooldrained.append(True)
        else:
            pooldrained.append(False)
    return pooldrained
# KPI 1: ending price
def fun_endprice(df,totalstep = 100)->list:
    endprices = []
    for unique_id in df['unique_id'].unique():
        subdf = df.loc[df['unique_id']==unique_id]
        if len(subdf)<totalstep:
            endprices.append(0)
        else:
            endprices.append(subdf['price'].iloc[-1])
    return endprices
# KPI 2: total reserve change (indicating how much the treasury has spent)
def fun_reserve_change(df)->list:
    reserve_change_arr = []
    for unique_id in df['unique_id'].unique():
        subdf = df.loc[df['unique_id']==unique_id]
        reserve_change_arr.append(subdf['reserves_stables'].iloc[-1] -subdf['reserves_stables'].iloc[0] )
        #reserve_change_arr.append(subdf['reserves_out'].sum() )
    return reserve_change_arr

# KPI 3: total amount of RBS being in action when price is lower than target
def fun_RBS_bid_count(df)->list:
    if 'bid_change_usd' not in df.columns:
        return None # this simulation doesn't include any RBS run.
    else:
        RBS_bid_counter_arr = []
        for unique_id in df['unique_id'].unique():
            subdf = df.loc[df['unique_id']==unique_id].reset_index()
            bidcount = sum(subdf['bid_change_usd']!=0)
            RBS_bid_counter_arr.append(bidcount)
        return RBS_bid_counter_arr
# KPI 4: total amount of bid from RBS
def fun_RBS_bid_amount(df)->list:
    if 'bid_change_usd' not in df.columns:
        return None # this simulation doesn't include any RBS run.
    else:
        RBS_bid_amount_arr = []
        for unique_id in df['unique_id'].unique():
            subdf = df.loc[df['unique_id']==unique_id].reset_index()
            bidcount = sum(subdf['bid_change_usd'])
            RBS_bid_amount_arr.append(bidcount)
        return RBS_bid_amount_arr

def get_kpi_from_df(df,**arg)->pd.DataFrame:
    kpis = {'pool_drained':fun_pooldrained,'end_price':fun_endprice,'reserve_change':fun_reserve_change,'RBS_intervene_number':fun_RBS_bid_count,'RBS_bid_total':fun_RBS_bid_amount}
    kpi_df = pd.DataFrame(index=df['unique_id'].unique())
    for kpiname,kpifunc in kpis.items():
        arr = kpifunc(df)#TODO: deal with different additional args
        if arr: # not None, i.e. this kpi doesn't apply
            kpi_df[kpiname] = arr 
    return kpi_df.reset_index().rename(columns={'index':'unique_id'})
