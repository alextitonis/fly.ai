import os

# dill stripped for Pyodide compatibility

from cadCAD.configuration import Experiment

name = "cadCAD"
version = "0.5.3"
experiment = Experiment()
configs = experiment.configs

# dill.settings["recurse"] = True  # stripped for Pyodide

logo = r"""
                  ___________    ____
  ________ __ ___/ / ____/   |  / __ \
 / ___/ __` / __  / /   / /| | / / / /
/ /__/ /_/ / /_/ / /___/ ___ |/ /_/ /
\___/\__,_/\__,_/\____/_/  |_/_____/
by cadCAD
"""
