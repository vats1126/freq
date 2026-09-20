import type { Interest, Question } from "../types";
import { INTEREST_IDS } from "./interests";

/**
 * Deterministic themer: the built-in fallback when no AI is available (or when the AI's output is rejected).
 *
 * It does what the AI does, without a model: keep the academic core word for word and change only the
 * setting. Every numeric question is covered for all seven interests, and a test proves each result passes
 * the same validator that guards AI output.
 */

interface Context {
  /** "Picture a spacecraft instrument ..." */
  setup: string;
  /** A device or place for circuit questions. */
  circuit: string;
  /** How the device is supplied, e.g. "operating at". */
  at: string;
  /** A place for chemistry questions. */
  lab: string;
  /** A short setting that can safely frame a conceptual multiple-choice question. */
  mcq: string;
}

const CONTEXTS: Record<Interest, Context> = {
  space: { setup: "Imagine", circuit: "a spacecraft instrument", at: "operating at", lab: "an astronaut chemist's lab on a space station", mcq: "During a space-mission briefing," },
  sports: { setup: "Picture", circuit: "a stadium scoreboard", at: "powered by", lab: "a sports-drink testing lab", mcq: "During a team training briefing," },
  gaming: { setup: "Picture", circuit: "a gaming console", at: "running on", lab: "a chemistry mini-game", mcq: "In a game-design challenge," },
  animals: { setup: "Imagine", circuit: "a wildlife camera trap", at: "powered by", lab: "a veterinary lab", mcq: "At a wildlife-care station," },
  technology: { setup: "Picture", circuit: "a robot's sensor board", at: "running at", lab: "a battery-testing lab", mcq: "In a device-testing lab," },
  environment: { setup: "Imagine", circuit: "a solar-powered weather station", at: "powered by", lab: "a river-water testing station", mcq: "At an environmental monitoring station," },
  art: { setup: "Picture", circuit: "an LED art installation", at: "glowing at", lab: "a paint-mixing studio", mcq: "In an interactive art studio," },
};

type Vars = Record<string, number>;
type Scene = (v: Vars, c: Context) => string;

/** One scene per numeric learning objective. Each keeps the original clauses, units and question intact. */
const SCENES: Record<string, Scene> = {
  // ---- Electric current
  "Apply I = Q / t": (v, c) => `${c.setup} ${c.circuit}. A charge of ${v.Q} C flows past a point in a wire in ${v.t} s. What is the current in amperes?`,
  "Find charge from current and time": (v, c) => `${c.setup} ${c.circuit} running for a while. A current of ${v.I} A flows for ${v.t} s. How much charge flows through the wire, in coulombs?`,
  "Find time from charge and current": (v, c) => `${c.setup} ${c.circuit} being tested. ${v.Q} C of charge passes through a wire carrying ${v.I} A. For how many seconds did the current flow?`,
  "Multi-step: convert minutes and find charge": (v, c) => `${c.setup} ${c.circuit} left switched on. A device draws ${v.I} A for ${v.m} minutes. How much charge passes through it, in coulombs?`,
  "Multi-step: find current from charge and minutes": (v, c) => `${c.setup} ${c.circuit} on a long test. A charge of ${v.Q} C flows through a wire in ${v.m} minutes. What is the current in amperes?`,

  // ---- Voltage
  "Apply V = W / Q": (v, c) => `${c.setup} ${c.circuit}. ${v.W} J of work is done moving ${v.Q} C of charge between two points. What is the potential difference in volts?`,
  "Find energy from voltage and charge": (v, c) => `${c.setup} ${c.circuit}. A ${v.V} V battery moves ${v.Q} C of charge around a circuit. How much energy does it supply, in joules?`,
  "Find charge from work and voltage": (v, c) => `${c.setup} ${c.circuit}. A battery does ${v.W} J of work at ${v.V} V. How much charge does it move, in coulombs?`,
  "Voltages of cells in series add": (v, c) => `${c.setup} ${c.circuit} with a battery pack. ${v.n} identical ${v.V} V cells are connected in series. What is the total voltage?`,
  "Voltage divides across identical bulbs in series": (v, c) => `${c.setup} ${c.circuit} lit by identical bulbs. A ${v.V} V battery is connected across ${v.n} identical bulbs in series. What is the voltage across each bulb, in volts?`,

  // ---- Resistance
  "Resistance scales with length": (v, c) => `${c.setup} the wiring inside ${c.circuit}. A wire has a resistance of ${v.R} Ω. A second wire of the same material and thickness is ${v.k} times as long. What is its resistance, in ohms?`,
  "Resistance scales inversely with area": (v, c) => `${c.setup} the wiring inside ${c.circuit}. A wire has a resistance of ${v.R} Ω. A wire of the same material and length has ${v.k} times the cross-sectional area. What is its resistance, in ohms?`,
  "Combine resistors in series": (v, c) => `${c.setup} the circuit board of ${c.circuit}. Resistors of ${v.a} Ω, ${v.b} Ω and ${v.c} Ω are connected in series. What is the total resistance, in ohms?`,
  "Combine two resistors in parallel": (v, c) => `${c.setup} the circuit board of ${c.circuit}. Two resistors of ${v.a} Ω and ${v.b} Ω are connected in parallel. What is the total resistance, in ohms?`,

  // ---- Ohm's Law
  "Apply Ohm's Law to find current": (v, c) => `${c.setup} ${c.circuit} ${c.at} ${v.V} V with ${v.R} Ω of resistance. Calculate the current.`,
  "Apply Ohm's Law to find voltage": (v, c) => `${c.setup} ${c.circuit} where a current of ${v.I} A flows through a ${v.R} Ω resistor. What is the voltage across it, in volts?`,
  "Find a missing resistance": (v, c) => `${c.setup} ${c.circuit} with a resistor that draws ${v.I} A when connected to ${v.V} V. What is its resistance, in ohms?`,
  "Convert milliamps and apply Ohm's Law": (v, c) => `${c.setup} ${c.circuit} in standby. A current of ${v.mA} mA flows through a ${v.R} Ω resistor. What is the voltage across it, in volts?`,
  "Multi-step: current in a series circuit": (v, c) => `${c.setup} ${c.circuit} powered by a ${v.V} V battery connected to a ${v.a} Ω and a ${v.b} Ω resistor in series. What current flows, in amperes?`,
  "Multi-step: voltage across one resistor": (v, c) => `${c.setup} ${c.circuit} where a ${v.V} V battery drives current through ${v.a} Ω and ${v.b} Ω resistors in series. What is the voltage across the ${v.b} Ω resistor, in volts?`,

  // ---- pH
  "Calculate pH from hydrogen ion concentration": (v, c) => `In ${c.lab}, a solution has a hydrogen ion concentration of 1 × 10⁻${v.n} mol/L. What is its pH?`,
  "Compare hydrogen ion concentration across pH values": (v, c) => `In ${c.lab}, samples are compared. How many times higher is the H⁺ concentration of a pH ${v.a} solution than a pH ${v.b} solution?`,
  "Effect of dilution on pH": (v, c) => `In ${c.lab}, a sample of pH ${v.p} is diluted so that its H⁺ concentration becomes 10 times smaller. What is the new pH?`,

  // ---- Titration
  "Use M₁V₁ = M₂V₂ to find concentration": (v, c) => `In ${c.lab}, ${v.V1} mL of ${v.M1} M HCl is exactly neutralised by ${v.V2} mL of NaOH solution. What is the concentration of the NaOH, in mol/L?`,
  "Multi-step: diprotic acid titration": (v, c) => `In ${c.lab}, ${v.V1} mL of ${v.M1} M H₂SO₄ is neutralised by NaOH of concentration ${v.M2} M. What volume of NaOH is needed, in mL?`,
  "Multi-step: analyse a titration result": (v, c) => `In ${c.lab}, a 25.0 mL sample of NaOH solution needs ${v.V} mL of 0.100 M HCl to reach the endpoint. What is the concentration of the NaOH, in mol/L?`,
};

/** True when a deterministic theme exists for this question. Concept (MCQ) questions remain unthemed. */
export function hasScene(q: Pick<Question, "type" | "objective">): boolean {
  return q.type !== "mcq" && q.objective in SCENES;
}

/** The deterministic themed stem, or null if there is none. Never changes numbers or the question asked. */
export function sceneFor(q: Pick<Question, "type" | "objective" | "variables" | "stem">, interest: Interest): string | null {
  if (q.type === "mcq") return null;
  if (!hasScene(q) || !q.variables) return null;
  return SCENES[q.objective](q.variables, CONTEXTS[interest]).replace(/\s+/g, " ").trim();
}

export { INTEREST_IDS };
