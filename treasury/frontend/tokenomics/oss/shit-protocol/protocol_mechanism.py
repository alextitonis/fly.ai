    
def floating_supply_mechanism(supply,liq_shit):
    return max(supply-liq_shit,0)
def mcap_mechanism(supply,price):
    return supply * price
def ratio_mechanism(r1,r2):
    return (r2 and r1/r2)