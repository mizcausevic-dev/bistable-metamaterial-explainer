# Reduced-order model validation

Evidence level: illustrative reduced-order model. Not experimental validation, finite-element verification, material calibration, or an impact test.

Duration 34 s. Sample rate 240 Hz. Rows 4.
Q_M=0.7, H_A=1, DELTA_H=0.32, λ=[1.05, 1.85, 2.6, 3.4].
K_AX=6.5, M_Q=0.34, C_Q=0.58, M_NODE=0.16, C_NODE=0.62, K_CONTACT=700.
Initial clearance 0.03. Lift gap 0.18. Platen keyframes live in platenMotion.
Reset λ=1.05, mass=0.07, damping=0.4, force factor=9, critical force=-0.0202, pulse 28.45–30.15 s.
Drawing amplitudes State A 0.38, State B -0.2.

Unloaded array height State A 4.0000, State B 2.7200.
Mid-unload t=28 s compression 1.3407, force 0.0000, q=1.048, 1.033, 1.019, 1.007.

## Checks

- PASS: Row 1 unloaded equilibria. U'(0)=0.000000, U'(1)=0.000000, U''(0)=0.7350, U''(1)=0.3150, U(1)-U(0)=0.0350, U(barrier)-U(1)=0.0040
- PASS: Row 2 unloaded equilibria. U'(0)=0.000000, U'(1)=0.000000, U''(0)=1.2950, U''(1)=0.5550, U(1)-U(0)=0.0617, U(barrier)-U(1)=0.0071
- PASS: Row 3 unloaded equilibria. U'(0)=0.000000, U'(1)=0.000000, U''(0)=1.8200, U''(1)=0.7800, U(1)-U(0)=0.0867, U(barrier)-U(1)=0.0099
- PASS: Row 4 unloaded equilibria. U'(0)=0.000000, U'(1)=0.000000, U''(0)=2.3800, U''(1)=1.0200, U(1)-U(0)=0.1133, U(barrier)-U(1)=0.0130
- PASS: State A coupled equilibrium. gradient norm 0.00000000; eigenvalues 0.367, 0.935, 1.497, 2.100, 2.445, 7.369, 16.003, 23.676
- PASS: State B coupled equilibrium. gradient norm 0.00000000; eigenvalues 0.187, 0.436, 0.675, 0.941, 1.754, 7.239, 15.955, 23.645
- PASS: Connector clearance. minimum row spacing 0.4021
- PASS: Nonnegative damping coefficients. C_Q=0.58, C_NODE=0.62, reset C=0.4
- PASS: Sequential barrier crossings. crossing times 15.15, 18.28, 22.70, 23.38 s
- PASS: Zero-load retention. final q=1.005, 1.002, 1.001, 1.000; force=0.0000; compression=1.2836; platen=2.9000; min q after 25 s=1.0003
- PASS: Force drops at snaps. row 1: 0.109; row 2: 0.088; row 3: 0.192; row 4: 0.206
- PASS: Open force path. start (0.0000, 0.0000), peak-window (1.8392, 0.6175), end (1.2836, 0.0000)
- PASS: Main-array energy balance. final residual 0.00000, max residual 0.00000, end work 2.3833, elastic 0.2967, dissipated 2.0866, kinetic 0.0000
- PASS: Separate reset actuation. q_reset(27.8)=1.0000, q_reset(33)=0.0003, v=-0.0028, trigger work=0.1018, released elastic=0.0350
- PASS: Illustrative arc length stays in a bounded band. State A arc 1.2312, State B arc 0.7405, ratio 0.6014. This is a kinematic drawing check, not a beam-element constraint.
- PASS: Repeatable sampling. two samples at t=18.25 s match exactly
- PASS: Dissipation is accumulated and nonnegative. end dissipated 2.0866

## Approximations

- One coordinate per row. Three side-by-side cells in a row share that coordinate in the drawing.
- The rendered beam is a clamped kinematic map of q and the current connector spacing. Arc length is not enforced by a beam element.
- Contact is a smooth unilateral penalty, not a rigid constraint solver.
- A one-sided quartic wall acts only for q > 1. It leaves both minima, their curvatures, and the barrier unchanged, and keeps an already-switched row from collapsing when later rows are still being compressed.
- Viscous terms are illustrative material damping. They are not a calibrated viscoelastic polymer model.
- Visible snap timing is the timing of this nondimensional trajectory. It is not a predicted laboratory switching time.
- No friction, plasticity, fracture, latch, or magnetic term is present.

