"""Autonomous patrol: modules behind interfaces, so the simulator and real drones share everything above the hardware.

    core.py        types + the hardware interfaces (Vehicle, GpsSensor, MotionSensor, Camera, Battery, Dock, Radio)
    geo.py         latitude/longitude <-> metres from home
    localize.py    GPS + own-motion fusion (Kalman filter); dead reckoning when GPS is gone
    patrol.py      routes (lawnmower over an area), resumable after a charge
    steer.py       PlainSteer (ours) and BrainSteer (the connectome turns), interchangeable
    energy.py      when to head home
    detect.py      detectors: SmokeDetector (real), ground projection
    land.py        pad finding (ArUco for real hardware) and the landing controller
    report.py      finds -> a deduplicated log
    mission.py     the state machine that ties it together
    sim_backend.py the simulator's implementations: the worked example for real hardware
    run_sim.py     one simulated patrol, scored against the sim's truth
"""
