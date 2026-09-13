from typing import List
from pandas import DataFrame
import pandas as pd
import matplotlib.pyplot as plt
import numpy as np
from .shitbond_metrics import get_price_standard_deviation

def tree_regression_analysis(df,xnames:list,yname:str,tree_depth=2):
    from sklearn.tree import DecisionTreeRegressor,plot_tree
    # fit the tree
    X = df[xnames]
    y = df[yname]
    tree = DecisionTreeRegressor(max_depth=tree_depth)
    tree.fit(X, y)
    # plot the tree
    fig,ax = plt.subplots(figsize = (15,6))
    plot_tree(tree,
              rounded=True,
              proportion=True,
              fontsize=8,
              feature_names=X.columns,
              filled=True,ax=ax)
    
    ax.set_title(f'Decision tree, score: {tree.score(X, y) :.0%}. N: {len(X) :.2e}')
              

def randomforest_regression_analysis(df,xnames:list,yname:str):
    from sklearn.ensemble import RandomForestRegressor
    # fit model
    X = df[xnames]
    y = df[yname]
    rf = RandomForestRegressor()
    rf.fit(X, y)
    importance = (pd.DataFrame(list(zip(X.columns, rf.feature_importances_)),
                        columns=['features', 'importance'])
            .sort_values(by='importance', ascending=False)
            )
    
    # plot the feature importance
    import seaborn as sns
    fig,ax = plt.subplots(figsize = (15,6))

    sns.barplot(data=importance,
                    x=importance.features,
                    y=importance.importance,
                    ax=ax,
                    label='small')
    plt.setp(ax.xaxis.get_majorticklabels(), rotation=45)
    ax.set_title(f'Feature Importance')

def plot_all_sims(var_list: List[str], df: DataFrame):
    for col in var_list:
        df.pivot("timestep", "unique_id", col).plot(kind='line')
        plt.title(col)
        plt.legend([])
        plt.show()

def plot_grouped_variables_average(var_list: List[str], grouping_variables: List[str], df: DataFrame,legend_loc='',colormap = 'tab10'):
    data = df.groupby(grouping_variables + ["timestep"])[var_list].mean()
    for col in var_list:
        data[col].unstack(-1).T.plot(kind='line',colormap=colormap)
        plt.title(col)
        plt.legend(ncol = int(len(data['price'].unstack(-1).T.columns)/4))
        if len(legend_loc)>0:
            plt.legend(loc=legend_loc,ncol = int(len(data['price'].unstack(-1).T.columns)/4))

        plt.show()
    return plt.figure



def plot_multivars_grouped_average(var_list: list[str], grouping_variables: list[str], df: DataFrame, linestyles: list = []):
    grpvar_vals = np.unique(df[grouping_variables], axis=0)
    # .reset_index(grouping_variables)
    data = df.groupby(grouping_variables + ["timestep"])[var_list].mean()
    fig, axes = plt.subplots(nrows=len(grpvar_vals),
                             figsize=(4*len(grpvar_vals), 20))

    if len(linestyles) == 0:
        linestyles = ['-'] * len(var_list)
    for k, ax in enumerate(axes):
        for plotvar, lstyle in zip(var_list, linestyles):
            ax.plot(data[plotvar].unstack(-1).T[tuple(grpvar_vals[k])],
                    label=plotvar, linestyle=lstyle)
            ax.legend()
        titlestr = ''
        for var, varval in zip(grouping_variables, grpvar_vals[k]):
            titlestr += f'{var} = {varval}, '
        ax.set_title(titlestr[:-2])
    fig.show()
    return fig


def plot_price_standard_deviation(df: DataFrame):
    # TODO: allow different ways to group simulations (now it's based on bond_schedule)
    av_std, se_of_std = get_price_standard_deviation(df)
    plt.bar(x=np.arange(len(av_std)), height=av_std)
    plt.errorbar(x=np.arange(len(av_std)), y=av_std, yerr=se_of_std, color='k')
    plt.xticks(ticks=np.arange(len(av_std)),
               labels=df['bond_schedule_name'].dropna().unique(), rotation=45)
    plt.ylabel('average standard deviation in the run')
    plt.show()


def plot_price_standard_deviation_multiple_exps(exps: List[dict]):
    # TODO: allow different ways to group simulations (now it's based on bond_schedule)
    means = {}
    ses = {}
    for exp in exps:
        df = exp['df']
        exp_label = exp['label']
        av_std, se_of_std = get_price_standard_deviation(df)
        means[exp_label] = av_std
        ses[exp_label] = se_of_std
    means_df = DataFrame(
        means, index=df['bond_schedule_name'].dropna().unique())
    ses_df = DataFrame(ses, index=df['bond_schedule_name'].dropna().unique())

    fig, ax = plt.subplots()
    means_df.plot.bar(yerr=ses_df, ax=ax, capsize=4, rot=-45)
    fig.show()


def get_interruption_rate(df: DataFrame, totalstep: int, grouping_variables: List[str]) -> DataFrame:
    """Find the average rate of interruption of the simulation.

    Args:
        df (DataFrame): The parsed data from cadCAD simulations
        totalstep (int): The total number of timesteps in a regular simulation
        grouping_variables (List[str]): The variables to group by

    Returns:
        DataFrame: A dataframe of averages for interruption rate
    """
    # Find the maximum step by sim
    maxstep = df.groupby("unique_id").timestep.max()
    maxstep.name = "Maximum Timestep"

    # Get the data together
    r_interrupt = df.groupby("unique_id")[grouping_variables].last()
    r_interrupt = r_interrupt.join(maxstep)

    # Add in a column for whether there was an interruption
    r_interrupt["interruption"] = r_interrupt["Maximum Timestep"] < totalstep

    # Group
    r_interrupt = r_interrupt.groupby(grouping_variables)[
        "interruption"].mean()
    return r_interrupt


def plot_simu_interruption_rate(df: DataFrame, number_steps: int, grouping_variables: List[str]):
    """Plots the interruption rate of different simulations

    Args:
        df (DataFrame): The parsed data from cadCAD simulations
        number_steps (int): The total number of timesteps in a regular simulation
        grouping_variables (List[str]): The variables to group by
    """
    interrupt_rate = get_interruption_rate(
        df, number_steps, grouping_variables)

    interrupt_rate.plot(kind='bar')

    #plt.bar(np.arange(len(interrupt_rate)), interrupt_rate)
    # plt.xticks(ticks=np.arange(len(interrupt_rate)),
    #           labels=df['bond_schedule_name'].dropna().unique(), rotation=-45)
    #plt.ylabel('average rate of a run unfinished')
    plt.show()


def plot_simu_interruption_rate_multiple_exps(exps: List[dict], number_steps: int):
    all_r_interrupt = {}
    for exp in exps:
        df = exp['df']
        exp_label = exp['label']
        interrupt_rate = get_interruption_rate(df, number_steps)
        all_r_interrupt[exp_label] = np.array(interrupt_rate)
    all_r_interrupt_df = DataFrame(
        all_r_interrupt, index=df['bond_schedule_name'].dropna().unique())
    fig, ax = plt.subplots()
    all_r_interrupt_df.plot.bar(ax=ax, capsize=4, rot=-45)
    fig.show()
