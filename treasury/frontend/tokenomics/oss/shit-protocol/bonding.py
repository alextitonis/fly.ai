import numpy as np


def price_curve(expiration_duration: int, discount_rate: float) -> float:
    # Returns the discount factor to be applied to the bond
    discount_factor = 1 / (1 + discount_rate) ** (expiration_duration/365)
    return discount_factor


def bond_sell_batch_auction(bonds: list, discount_rate: float):
    total_sell_amount = 0
    for bond in bonds:
        av_price = price_curve(bond.expiration_duration, discount_rate)
        sell_amount = bond.total_amount*av_price
        total_sell_amount += sell_amount
    return total_sell_amount
