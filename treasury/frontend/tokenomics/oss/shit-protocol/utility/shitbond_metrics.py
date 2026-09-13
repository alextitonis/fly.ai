import numpy as np
from scipy.stats import sem
import pandas as pd

    


def plot_relative_kpi(kpi,kpidf,descriptors,group_vars = [],log_y=False):
    reference_val = kpidf.loc[kpidf['front_load_amount']==0][kpi].mean() # front_load_amount == 0 means there's no bond
    comparative_vals = kpidf.loc[kpidf['front_load_amount']!=0][kpi]-reference_val
    comparative_vals = pd.concat([comparative_vals,descriptors.loc[descriptors['front_load_amount']!=0]],axis=1)

    if len(group_vars)==0:
        group_vars = list(descriptors.columns)

    for group_par in group_vars:
        plotdf = comparative_vals.groupby(group_par).agg([np.mean,sem])
        plotdf[kpi].plot(kind='bar',y='mean',yerr='sem',title=kpi + ' (relative to no bond)',logy=log_y)
    return 


# ----below: another way to calculate price volatility we are not using any more ----
def get_moving_standard_deviation_df(pdseries, windowlen = 30):
    mstd = pdseries.rolling(window=windowlen,min_periods=1).std()
    return mstd
def get_price_standard_deviation(df):
    # TODO: 1) seperate each run 2) calc the ma and then sd for each run 3) aggregate across runs...groups??
    av_std = []
    se_of_std = []
    for subset in df['subset'].unique():
        subset_std = []
        for run in df['run'].unique():
            subdf = df.loc[(df['subset']==subset) & (df['run']==run)]
            subset_std.append(np.nanmean(get_moving_standard_deviation_df(subdf['price'])))
        av_std.append(np.mean(subset_std))
        se_of_std.append(np.std(subset_std)/np.sqrt(len(subset_std)))
    return av_std,se_of_std

