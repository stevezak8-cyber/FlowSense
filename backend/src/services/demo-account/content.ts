/**
 * Static content for the demo account: a fictional Austin HVAC shop with six
 * trucks. Everything here is invented. No real people, no real phone numbers
 * (all 555-01xx), no email addresses on customers, so nothing the demo does
 * can ever reach a real person.
 */

export const DEMO_SLUG = "demo-hill-country-comfort"
export const DEMO_ORG_NAME = "Hill Country Comfort Heating & Air"
export const DEMO_ORG_ADDRESS = "1420 S Lamar Blvd, Austin, TX 78704"
export const DEMO_ORG_PHONE = "(512) 555-0100"
// Business-local time for every scheduled hour, so jobs read as 7am-5pm in the
// viewer's browser instead of shifting with the server's timezone (Railway is UTC).
export const DEMO_TZ = "America/Chicago"

export type EquipType = "ac" | "furnace" | "heat-pump" | "rtu" | "boiler" | "mini-split" | "thermostat"

export interface TechSpec {
  name: string
  epa608Level: "Type I" | "Type II" | "Universal"
  skills: EquipType[]
  vehicle: string
  onDuty: boolean
}

export const TECHS: TechSpec[] = [
  { name: "Marcus Reyes", epa608Level: "Universal", skills: ["furnace", "ac", "heat-pump", "boiler", "thermostat"], vehicle: "Truck 1", onDuty: true },
  { name: "Dana Whitaker", epa608Level: "Type II", skills: ["ac", "heat-pump", "mini-split", "thermostat"], vehicle: "Truck 2", onDuty: true },
  { name: "Tyler Nguyen", epa608Level: "Type II", skills: ["furnace", "ac", "thermostat"], vehicle: "Truck 3", onDuty: true },
  { name: "Renata Foster", epa608Level: "Universal", skills: ["rtu", "ac", "heat-pump", "boiler"], vehicle: "Van 4", onDuty: true },
  { name: "Jake Holloway", epa608Level: "Type I", skills: ["furnace", "thermostat", "boiler"], vehicle: "Van 5", onDuty: false },
  { name: "Luis Ortega", epa608Level: "Type II", skills: ["ac", "rtu", "mini-split", "heat-pump"], vehicle: "Truck 6", onDuty: true },
]

export interface EquipSpec { type: Exclude<EquipType, "thermostat">; make: string; model: string }

export interface CustomerSpec {
  name: string
  address: string
  kind: "residential" | "commercial"
  notes?: string
  hero?: boolean
  equip: EquipSpec[]
}

const ac = (make: string, model: string): EquipSpec => ({ type: "ac", make, model })
const furnace = (make: string, model: string): EquipSpec => ({ type: "furnace", make, model })
const hp = (make: string, model: string): EquipSpec => ({ type: "heat-pump", make, model })
const rtu = (make: string, model: string): EquipSpec => ({ type: "rtu", make, model })
const boiler = (make: string, model: string): EquipSpec => ({ type: "boiler", make, model })
const mini = (make: string, model: string): EquipSpec => ({ type: "mini-split", make, model })

export const CUSTOMERS: CustomerSpec[] = [
  { name: "Jennifer Castillo", address: "3204 Oak Hollow Dr, Austin, TX 78745", kind: "residential", hero: true, notes: "Prefers morning appointments. Dog in the backyard, so call from the driveway.", equip: [ac("Trane", "XR16"), furnace("Trane", "S9V2")] },
  { name: "Robert Hayes", address: "812 Barton Hills Dr, Austin, TX 78704", kind: "residential", equip: [ac("Carrier", "24ACC636"), furnace("Carrier", "59TP6A")] },
  { name: "Aisha Johnson", address: "1907 E 12th St, Austin, TX 78702", kind: "residential", notes: "Works from home. Knock, don't ring.", equip: [hp("Lennox", "XP16")] },
  { name: "Michael Brennan", address: "7411 Shoal Creek Blvd, Austin, TX 78757", kind: "residential", equip: [ac("Lennox", "ML14XC1"), furnace("Lennox", "EL296V")] },
  { name: "Sofia Alvarez", address: "2250 Bluebonnet Ln, Austin, TX 78704", kind: "residential", notes: "Gate code 4471.", equip: [ac("Goodman", "GSX140361"), furnace("Goodman", "GMVC96")] },
  { name: "David Kim", address: "5106 Balcones Dr, Austin, TX 78731", kind: "residential", equip: [hp("Carrier", "25HCE4"), mini("Mitsubishi", "MUZ-FS12NA")] },
  { name: "Emily Thornton", address: "1400 Rosewood Ave, Austin, TX 78702", kind: "residential", equip: [ac("Rheem", "RA1448"), furnace("Rheem", "R96V")] },
  { name: "Carlos Mendoza", address: "9302 Brodie Ln, Austin, TX 78748", kind: "residential", equip: [ac("Daikin", "DX14SA"), furnace("Bryant", "926T")] },
  { name: "Rachel Goldberg", address: "3718 Jefferson St, Austin, TX 78731", kind: "residential", equip: [hp("Trane", "XR15")] },
  { name: "James Whitmore", address: "11200 Manchaca Rd, Austin, TX 78748", kind: "residential", notes: "Elderly homeowner. Explain each step and take your time.", equip: [ac("York", "YC2D"), furnace("Goodman", "GMVC96")] },
  { name: "Priya Nair", address: "4605 Duval St, Austin, TX 78751", kind: "residential", equip: [ac("Carrier", "24ACC636"), furnace("Carrier", "59TP6A")] },
  { name: "Thomas Okafor", address: "6903 Burnet Rd, Austin, TX 78757", kind: "residential", equip: [ac("Trane", "XR14"), furnace("Trane", "S9V2")] },
  { name: "Hannah Lindqvist", address: "2711 Windsor Rd, Austin, TX 78703", kind: "residential", equip: [mini("Fujitsu", "AOU12RLS3"), mini("Fujitsu", "AOU12RLS3")] },
  { name: "Marcus Webb", address: "801 W Slaughter Ln, Austin, TX 78748", kind: "residential", equip: [ac("Lennox", "ML14XC1"), furnace("Lennox", "EL296V")] },
  { name: "Olivia Santos", address: "3300 Manor Rd, Austin, TX 78723", kind: "residential", equip: [hp("Carrier", "25HCE4")] },
  { name: "Daniel Fischer", address: "1610 W 35th St, Austin, TX 78703", kind: "residential", equip: [ac("Trane", "XR16"), furnace("Trane", "S9V2")] },
  { name: "Grace Tran", address: "8401 Mesa Dr, Austin, TX 78759", kind: "residential", equip: [ac("Goodman", "GSX140361"), furnace("Goodman", "GMVC96")] },
  { name: "Walter Dobbs", address: "2102 Hether St, Austin, TX 78704", kind: "residential", notes: "Fixed income. Mention the maintenance plan.", equip: [ac("Rheem", "RA1448"), furnace("Rheem", "R96V")] },
  { name: "Natalie Ruiz", address: "5809 Berkman Dr, Austin, TX 78723", kind: "residential", equip: [hp("Lennox", "XP16")] },
  { name: "Ben Carver", address: "4411 Speedway, Austin, TX 78751", kind: "residential", equip: [ac("Carrier", "24ACC636"), furnace("Carrier", "59TP6A")] },
  { name: "Hartwell Family Dental", address: "2400 S Congress Ave Ste 110, Austin, TX 78704", kind: "commercial", notes: "After-hours access: key at the front desk. Patients on site 8 to 5.", equip: [rtu("Lennox", "LGH072"), rtu("Lennox", "LGH072")] },
  { name: "Lamar Street Lofts HOA", address: "1500 S Lamar Blvd, Austin, TX 78704", kind: "commercial", notes: "Property manager is Denise. Call before entering units.", equip: [boiler("Lochinvar", "KBN-285"), rtu("Carrier", "48TCEA06")] },
  { name: "Barton Creek Coffee Co.", address: "3000 Barton Creek Blvd, Austin, TX 78735", kind: "commercial", equip: [rtu("Trane", "YHC048")] },
  { name: "Southpark Veterinary Clinic", address: "5200 S 1st St, Austin, TX 78745", kind: "commercial", notes: "Animals on site. Close doors behind you.", equip: [rtu("York", "ZF060"), ac("Carrier", "24ACC636")] },
  { name: "Oakmont Senior Living", address: "9100 Oakmont Dr, Austin, TX 78759", kind: "commercial", notes: "Resident comfort comes first. Disruptive work only between 10am and 2pm.", equip: [boiler("Burnham", "ES2"), rtu("Trane", "YHC048"), rtu("Trane", "YHC048")] },
  { name: "Westlake Montessori", address: "3400 Bee Cave Rd, Austin, TX 78746", kind: "commercial", equip: [ac("Daikin", "DX14SA"), furnace("Lennox", "EL296V")] },
  { name: "Congress Ave Law Group", address: "600 Congress Ave Ste 2100, Austin, TX 78701", kind: "commercial", notes: "Building engineer is Luis. Roof access is through the freight elevator.", equip: [rtu("Carrier", "48TCEA06")] },
  { name: "Riverside Self Storage", address: "2650 E Riverside Dr, Austin, TX 78741", kind: "commercial", equip: [rtu("York", "ZF060")] },
]

// More households so no single customer carries a month of the shop's work. Built from
// index arithmetic (not randomness) so the roster is identical on every reset.
const FIRST = ["Alicia", "Brandon", "Courtney", "Derek", "Elena", "Frank", "Gloria", "Harold", "Isabel", "Jamal", "Katherine", "Luis", "Monica", "Nathan", "Orlando", "Patricia", "Quincy", "Rosa", "Samuel", "Tanya", "Victor", "Wendy", "Xavier", "Yolanda", "Zachary", "Amelia", "Bruce", "Carmen", "Dennis", "Evelyn", "Felix", "Gabriela"]
const LAST = ["Abernathy", "Bishop", "Calloway", "Delgado", "Eastman", "Fitzgerald", "Gutierrez", "Hamilton", "Ibarra", "Jennings", "Kowalski", "Lombardi", "Montoya", "Novak", "Oyelaran", "Pruitt", "Quintero", "Rasmussen", "Sandoval", "Tillman", "Underwood", "Vasquez", "Whitfield", "Yamamoto", "Zimmerman", "Alvarado", "Bennett", "Cardenas", "Dawson", "Espinoza", "Fontaine", "Gallegos"]
const STREETS = ["Cedar Elm Dr", "Mockingbird Ln", "Pecan Ridge Rd", "Live Oak Trl", "Sunset Valley Dr", "Westgate Blvd", "Pleasant Valley Rd", "Airport Blvd", "Parmer Ln", "Lake Austin Blvd", "Anderson Ln", "Guadalupe St", "Lamar Blvd", "William Cannon Dr", "Ben White Blvd", "Riverside Dr", "Manchaca Rd", "Bluff Springs Rd", "Oltorf St", "Koenig Ln", "Rundberg Ln", "Colony Loop Dr", "Dessau Rd", "Springdale Rd", "Cameron Rd", "Slaughter Ln", "Brodie Ln", "Hyde Park Ave", "Tarrytown Ln", "Zilker Park Ln", "Clarksville Ct", "Bull Creek Rd"]
const ZIPS = ["78701", "78702", "78703", "78704", "78705", "78721", "78722", "78723", "78724", "78731", "78735", "78741", "78744", "78745", "78746", "78748", "78749", "78751", "78752", "78753", "78756", "78757", "78758", "78759"]
const COMBOS: EquipSpec[][] = [
  [ac("Carrier", "24ACC636"), furnace("Carrier", "59TP6A")],
  [hp("Trane", "XR15")],
  [ac("Lennox", "ML14XC1"), furnace("Lennox", "EL296V")],
  [ac("Goodman", "GSX140361"), furnace("Goodman", "GMVC96")],
  [ac("Rheem", "RA1448"), furnace("Rheem", "R96V")],
  [ac("Trane", "XR14"), furnace("Trane", "S9V2")],
  [hp("Lennox", "XP16")],
  [mini("Mitsubishi", "MUZ-FS12NA"), ac("Daikin", "DX14SA")],
  [ac("York", "YC2D"), furnace("Bryant", "926T")],
  [hp("Carrier", "25HCE4")],
]
const GENERATED: CustomerSpec[] = FIRST.map((first, i) => ({
  name: `${first} ${LAST[i]}`,
  address: `${1000 + ((i * 937) % 8800)} ${STREETS[i]}, Austin, TX ${ZIPS[(i * 5) % ZIPS.length]}`,
  kind: "residential" as const,
  notes: i % 6 === 2 ? "Prefers text over calls." : i % 9 === 4 ? `Gate code ${1000 + i * 37}.` : undefined,
  equip: COMBOS[i % COMBOS.length],
}))
CUSTOMERS.push(...GENERATED)

export interface JobTemplate {
  type: EquipType
  service: "repair" | "maintenance" | "inspection" | "installation"
  season: "cool" | "heat" | "any"
  symptom: string
  invoiceLabel: string
  summary: string
  actions: string
  parts: string[]
  amount: [number, number]
  /** Refrigerant was handled, so the job gets an EPA 608 entry. */
  refrigerant?: boolean
  /** Combustion or gas work, so the job gets a safety acknowledgement. */
  gas?: boolean
  weight?: number
  /** This repair has a Good/Better/Best estimate variant. */
  estimate?: "compressor" | "capacitor" | "igniter" | "leak" | "fan"
  /** What happened to that estimate when the job is already complete. */
  outcome?: "approved" | "declined" | "expired"
}

export const TEMPLATES: JobTemplate[] = [
  // Cooling
  { type: "ac", service: "repair", season: "cool", symptom: "AC blowing warm air", invoiceLabel: "AC repair: low refrigerant, leak sealed and recharged", summary: "Low refrigerant from a slow leak at the service valve. Sealed it and recharged; system cooling to spec.", actions: "Located leak with electronic detector; replaced Schrader core; recovered and recharged R-410A; verified superheat and subcool.", parts: ["Schrader valve core", "R-410A refrigerant"], amount: [285, 460], refrigerant: true, weight: 1.4, estimate: "leak" },
  { type: "ac", service: "repair", season: "cool", symptom: "Outdoor unit not starting", invoiceLabel: "AC repair: dual-run capacitor", summary: "Failed dual-run capacitor. Replaced it; unit starts and runs normally.", actions: "Discharged and tested capacitor (read 31 µF on a 45/5 rating); replaced; verified compressor and fan amps.", parts: ["Dual-run capacitor 45/5 µF"], amount: [165, 260], weight: 1.5, estimate: "capacitor" },
  { type: "ac", service: "repair", season: "cool", symptom: "Frozen evaporator coil", invoiceLabel: "AC repair: iced coil, airflow restored", summary: "Restricted airflow from a clogged filter and dirty blower wheel caused icing. Thawed the coil, cleaned the blower, replaced the filter.", actions: "Thawed coil; cleaned blower wheel; replaced filter; verified temperature drop across the coil.", parts: ["1-inch pleated filter"], amount: [189, 340] },
  { type: "ac", service: "repair", season: "cool", symptom: "AC short cycling", invoiceLabel: "AC repair: contactor replaced", summary: "Pitted contactor contacts were dropping out under load. Replaced the contactor and tightened lugs.", actions: "Measured voltage drop across contacts; replaced 24V contactor; torqued all high-voltage lugs.", parts: ["24V contactor"], amount: [175, 280], estimate: "capacitor" },
  { type: "ac", service: "repair", season: "cool", symptom: "Water leaking from the air handler", invoiceLabel: "AC repair: condensate drain cleared", summary: "Clogged condensate drain. Cleared the line, flushed with vinegar, tested the float switch.", actions: "Cleared drain line with wet/dry vac; flushed trap; tested float switch; leveled drain pan.", parts: [], amount: [129, 210] },
  { type: "ac", service: "repair", season: "cool", symptom: "Condenser fan motor noisy and slow", invoiceLabel: "AC repair: condenser fan motor and capacitor", summary: "Worn condenser fan motor bearings. Replaced the motor and capacitor; airflow and amps normal.", actions: "Replaced fan motor and run capacitor; checked blade clearance; verified amp draw against the nameplate.", parts: ["Condenser fan motor", "Run capacitor"], amount: [380, 560], estimate: "fan", outcome: "approved" },
  { type: "ac", service: "repair", season: "cool", symptom: "AC not cooling, compressor hums but won't start", invoiceLabel: "AC repair: compressor replacement", summary: "Compressor failed with a locked rotor. Presented three options; customer approved the replacement.", actions: "Recovered refrigerant; replaced scroll compressor and filter drier; pulled vacuum to 500 microns; recharged to spec.", parts: ["Scroll compressor", "Filter drier", "R-410A refrigerant"], amount: [1450, 2300], refrigerant: true, weight: 0.45, estimate: "compressor", outcome: "approved" },
  { type: "ac", service: "repair", season: "cool", symptom: "No cooling, diagnostic only", invoiceLabel: "Diagnostic fee", summary: "Found a failed compressor. Presented replacement options; customer declined and will get a second opinion.", actions: "Full diagnostic; documented readings; presented Good/Better/Best replacement estimate.", parts: [], amount: [89, 129], weight: 0.25, estimate: "compressor", outcome: "declined" },
  { type: "ac", service: "repair", season: "cool", symptom: "AC not cooling upstairs", invoiceLabel: "AC repair: zone damper freed", summary: "Zone damper actuator was stuck closed. Freed it and verified airflow to both floors. Recommended an added return.", actions: "Replaced damper actuator linkage; balanced registers; measured static pressure.", parts: ["Damper actuator"], amount: [149, 260] },
  { type: "ac", service: "maintenance", season: "cool", symptom: "AC tune-up before summer", invoiceLabel: "AC tune-up", summary: "Cleaned condenser coil, checked charge, tested capacitor and amps. System in good condition.", actions: "Coil wash; checked refrigerant charge; tested capacitor, contactor, and fan; cleared drain.", parts: [], amount: [109, 159], weight: 1.3 },
  // Heating
  { type: "furnace", service: "repair", season: "heat", symptom: "No heat: furnace won't ignite", invoiceLabel: "Furnace repair: flame sensor cleaned", summary: "Dirty flame sensor was causing an ignition lockout. Cleaned the sensor and verified a steady flame signal.", actions: "Cleaned flame sensor; verified flame signal at 3.5 µA; ran three full heat cycles.", parts: [], amount: [129, 210], gas: true, weight: 1.4 },
  { type: "furnace", service: "repair", season: "heat", symptom: "Furnace short cycling", invoiceLabel: "Furnace repair: pressure switch hose", summary: "Cracked pressure switch hose and a partially blocked vent caused short cycling. Replaced the hose and cleared the vent.", actions: "Replaced hose; cleared vent screen; verified pressure switch closes at spec; checked for CO.", parts: ["Pressure switch hose"], amount: [189, 330], gas: true },
  { type: "furnace", service: "repair", season: "heat", symptom: "Error code on the furnace control board", invoiceLabel: "Furnace repair: igniter replaced", summary: "Repeated ignition retry traced to a cracked igniter. Replaced it; furnace lights on the first try.", actions: "Ohm-tested igniter (out of range); replaced; verified ignition sequence and flame stability.", parts: ["Silicon nitride igniter"], amount: [225, 345], gas: true, estimate: "igniter" },
  { type: "furnace", service: "repair", season: "heat", symptom: "Blower runs constantly", invoiceLabel: "Furnace repair: fan relay", summary: "Stuck fan relay on the control board. Replaced the relay and verified fan timing.", actions: "Confirmed relay stuck closed; replaced; set fan-off delay; tested thermostat call.", parts: ["Fan relay"], amount: [210, 390] },
  { type: "furnace", service: "repair", season: "heat", symptom: "Burning smell on startup", invoiceLabel: "Furnace repair: inducer gasket", summary: "Dust burn-off plus a cracked inducer gasket. Replaced the gasket and cleaned the burner compartment.", actions: "Replaced inducer gasket; vacuumed burner compartment; combustion analysis within spec; CO check clear.", parts: ["Inducer gasket"], amount: [189, 295], gas: true },
  { type: "furnace", service: "maintenance", season: "heat", symptom: "Furnace tune-up before winter", invoiceLabel: "Furnace tune-up", summary: "Cleaned burners and flame sensor, tested safeties, measured temperature rise and gas pressure. CO test normal.", actions: "Burner and sensor cleaning; verified limit and rollout switches; measured temperature rise and manifold pressure; CO test.", parts: [], amount: [99, 149], gas: true, weight: 1.3 },
  { type: "furnace", service: "repair", season: "heat", symptom: "Cracked heat exchanger found, estimate sent", invoiceLabel: "Diagnostic fee", summary: "Found a hairline crack in the heat exchanger during inspection. Shut the unit down and sent a replacement estimate.", actions: "Visual and camera inspection; documented crack; tagged unit out of service; sent estimate.", parts: [], amount: [89, 129], gas: true, weight: 0.2, estimate: "igniter", outcome: "expired" },
  // Heat pumps
  { type: "heat-pump", service: "repair", season: "any", symptom: "Heat pump stuck in defrost", invoiceLabel: "Heat pump repair: defrost sensor", summary: "Failed defrost sensor kept the unit in defrost. Replaced the sensor and verified a complete cycle.", actions: "Tested defrost sensor (open circuit); replaced; ran forced defrost cycle; verified termination.", parts: ["Defrost sensor"], amount: [245, 420] },
  { type: "heat-pump", service: "repair", season: "any", symptom: "Heat pump not heating below 40°F", invoiceLabel: "Heat pump repair: refrigerant leak at flare fitting", summary: "Low charge from a leak at a flare fitting. Sealed it and recharged.", actions: "Leak-checked circuit; remade flare; pulled vacuum; recharged R-410A by weight; verified subcool.", parts: ["Flare fitting", "R-410A refrigerant"], amount: [345, 560], refrigerant: true, estimate: "leak" },
  { type: "heat-pump", service: "maintenance", season: "any", symptom: "Annual heat pump maintenance", invoiceLabel: "Heat pump tune-up", summary: "Cleaned coils, checked charge and reversing valve operation. Everything normal.", actions: "Coil wash; verified reversing valve in both modes; checked charge and electrical.", parts: [], amount: [119, 169] },
  // Mini-splits
  { type: "mini-split", service: "repair", season: "any", symptom: "Mini-split leaking inside", invoiceLabel: "Mini-split repair: drain pan cleared", summary: "Clogged condensate drain pan. Cleaned it and re-leveled the indoor unit.", actions: "Cleaned drain pan and line; re-leveled head; tested with water.", parts: [], amount: [129, 210] },
  { type: "mini-split", service: "repair", season: "any", symptom: "Mini-split blinking error code", invoiceLabel: "Mini-split repair: interconnect cable", summary: "Communication fault from a damaged section of the interconnect cable. Replaced the section.", actions: "Traced fault to damaged cable; spliced and sealed new section; cleared fault; ran both modes.", parts: ["Interconnect cable"], amount: [189, 340] },
  // Commercial RTUs
  { type: "rtu", service: "maintenance", season: "any", symptom: "Quarterly RTU service", invoiceLabel: "Quarterly rooftop unit service", summary: "Changed filters, cleaned coils, checked belts and amps. Readings logged.", actions: "Filter change; coil cleaning; belt tension and alignment; amp draw and temperature split logged.", parts: ["Pleated filters"], amount: [189, 349], weight: 1.4 },
  { type: "rtu", service: "repair", season: "cool", symptom: "Rooftop unit grinding noise", invoiceLabel: "RTU repair: blower bearing and belt", summary: "Worn blower bearing. Replaced the bearing and belt and aligned the pulleys.", actions: "Replaced blower shaft bearing and V-belt; aligned pulleys; verified vibration and amps.", parts: ["Blower bearing", "V-belt"], amount: [485, 780] },
  { type: "rtu", service: "repair", season: "cool", symptom: "RTU not cooling tenant space", invoiceLabel: "RTU repair: leak at TXV, recharged", summary: "Low charge from a leak at the TXV. Repaired it and recharged.", actions: "Isolated leak at TXV connection; repaired; pulled vacuum; recharged R-410A; verified superheat.", parts: ["TXV fitting kit", "R-410A refrigerant"], amount: [620, 1150], refrigerant: true, weight: 0.8, estimate: "leak" },
  // Boilers
  { type: "boiler", service: "maintenance", season: "heat", symptom: "Boiler annual inspection", invoiceLabel: "Boiler annual inspection", summary: "Cleaned the heat exchanger, tested the relief valve and low-water cutoff. All safeties pass.", actions: "Heat exchanger cleaning; relief valve and LWCO test; combustion analysis; CO check.", parts: [], amount: [189, 329], gas: true },
  { type: "boiler", service: "repair", season: "heat", symptom: "Boiler not holding pressure", invoiceLabel: "Boiler repair: expansion tank replaced", summary: "Failed expansion tank. Replaced it and re-pressurized the system.", actions: "Drained and replaced expansion tank; bled system; set fill pressure; checked relief valve.", parts: ["Expansion tank"], amount: [345, 640], gas: true },
  { type: "boiler", service: "repair", season: "heat", symptom: "No hot water from the boiler", invoiceLabel: "Boiler repair: circulator pump", summary: "Failed circulator pump. Replaced the pump and purged air from the loop.", actions: "Isolated and replaced circulator; purged loop; verified flow and delta-T.", parts: ["Circulator pump"], amount: [480, 820], gas: true },
  // Thermostats
  { type: "thermostat", service: "repair", season: "any", symptom: "Thermostat blank or not responding", invoiceLabel: "Thermostat repair", summary: "Loose C-wire connection. Re-terminated the wire and replaced the batteries.", actions: "Re-terminated C-wire; tested 24V at the board; verified all call modes.", parts: ["Thermostat batteries"], amount: [79, 149], weight: 0.6 },
  { type: "thermostat", service: "installation", season: "any", symptom: "Install smart thermostat", invoiceLabel: "Smart thermostat install", summary: "Installed a smart thermostat with a C-wire adapter and configured the schedule.", actions: "Installed thermostat and C-wire adapter; configured schedule and Wi-Fi; walked customer through the app.", parts: ["Smart thermostat", "C-wire adapter"], amount: [189, 329], weight: 0.5 },
  // Inspection and installs (rare, big tickets)
  { type: "ac", service: "inspection", season: "any", symptom: "Pre-purchase HVAC inspection", invoiceLabel: "Full system inspection with written report", summary: "Full system inspection with a written report and photos for the buyer.", actions: "Inspected all components; recorded model and serial data; wrote condition report.", parts: [], amount: [119, 189], weight: 0.3 },
  { type: "ac", service: "installation", season: "cool", symptom: "Replace 3-ton AC and coil (R-22 system)", invoiceLabel: "New 3-ton AC and coil installation", summary: "Installed a new 14 SEER2 system with matched coil. Permit pulled, startup checklist complete.", actions: "Recovered R-22; set condenser and coil; brazed lineset with nitrogen; pulled vacuum; startup and commissioning.", parts: ["3-ton condenser", "Matched evaporator coil", "Lineset kit"], amount: [6800, 9800], refrigerant: true, weight: 0.12 },
  { type: "furnace", service: "installation", season: "heat", symptom: "Replace 80% furnace at end of life", invoiceLabel: "New 96% furnace installation", summary: "Installed a high-efficiency furnace with new PVC venting. Permit pulled, combustion verified.", actions: "Removed old unit; set new furnace; PVC venting and condensate; gas leak check; combustion analysis.", parts: ["96% furnace", "PVC venting kit"], amount: [4200, 6200], gas: true, weight: 0.12 },
]

export interface PricebookSpec { name: string; category: "cooling" | "heating" | "parts" | "labor" | "maintenance"; unit: string; price: number; locked?: boolean; source?: "admin" | "ai" }

export const PRICEBOOK: PricebookSpec[] = [
  { name: "Diagnostic fee", category: "labor", unit: "per visit", price: 89, locked: true, source: "admin" },
  { name: "Standard labor", category: "labor", unit: "per hour", price: 125, source: "admin" },
  { name: "After-hours labor", category: "labor", unit: "per hour", price: 185, locked: true, source: "admin" },
  { name: "Travel fee", category: "labor", unit: "per visit", price: 45 },
  { name: "Emergency dispatch fee", category: "labor", unit: "per visit", price: 150, locked: true, source: "admin" },
  { name: "System commissioning", category: "labor", unit: "each", price: 295 },
  { name: "Refrigerant leak detection", category: "cooling", unit: "per visit", price: 125 },
  { name: "Refrigerant recharge, R-410A", category: "cooling", unit: "per lb", price: 85 },
  { name: "Capacitor replacement", category: "cooling", unit: "each", price: 245 },
  { name: "Contactor replacement", category: "cooling", unit: "each", price: 225 },
  { name: "Condenser fan motor replacement", category: "cooling", unit: "each", price: 520 },
  { name: "Compressor replacement, 3-ton", category: "cooling", unit: "each", price: 1850 },
  { name: "Evaporator coil cleaning", category: "cooling", unit: "each", price: 189 },
  { name: "Condensate drain clearing", category: "cooling", unit: "per visit", price: 129 },
  { name: "TXV replacement", category: "cooling", unit: "each", price: 695 },
  { name: "Igniter replacement", category: "heating", unit: "each", price: 285 },
  { name: "Flame sensor cleaning or replacement", category: "heating", unit: "each", price: 165 },
  { name: "Gas valve replacement", category: "heating", unit: "each", price: 565 },
  { name: "Inducer motor replacement", category: "heating", unit: "each", price: 640 },
  { name: "Blower motor replacement", category: "heating", unit: "each", price: 595 },
  { name: "Heat exchanger inspection", category: "heating", unit: "each", price: 149 },
  { name: "Pressure switch replacement", category: "heating", unit: "each", price: 225 },
  { name: "Filter drier", category: "parts", unit: "each", price: 65 },
  { name: "Hard start kit", category: "parts", unit: "each", price: 135 },
  { name: "Run capacitor (part only)", category: "parts", unit: "each", price: 35 },
  { name: "Contactor (part only)", category: "parts", unit: "each", price: 29 },
  { name: "1-inch pleated filter", category: "parts", unit: "each", price: 18 },
  { name: "4-inch media filter", category: "parts", unit: "each", price: 55 },
  { name: "Smart thermostat", category: "parts", unit: "each", price: 249 },
  { name: "Carbon monoxide detector", category: "parts", unit: "each", price: 69 },
  { name: "AC tune-up", category: "maintenance", unit: "per visit", price: 129 },
  { name: "Furnace tune-up", category: "maintenance", unit: "per visit", price: 129 },
  { name: "Heat pump tune-up", category: "maintenance", unit: "per visit", price: 139 },
  { name: "Full system inspection", category: "maintenance", unit: "per visit", price: 149 },
  { name: "Duct cleaning", category: "maintenance", unit: "per system", price: 475 },
  { name: "IAQ inspection", category: "maintenance", unit: "per visit", price: 175 },
  { name: "UV light installation", category: "maintenance", unit: "each", price: 395 },
]

type Tier = Array<[string, number]>
export const ESTIMATE_TIERS: Record<NonNullable<JobTemplate["estimate"]>, { good: Tier; better: Tier; best: Tier }> = {
  compressor: {
    good: [["Diagnostic fee", 1], ["Compressor replacement, 3-ton", 1], ["Filter drier", 1]],
    better: [["Diagnostic fee", 1], ["Compressor replacement, 3-ton", 1], ["Filter drier", 1], ["Hard start kit", 1]],
    best: [["Diagnostic fee", 1], ["Compressor replacement, 3-ton", 1], ["Filter drier", 1], ["Hard start kit", 1], ["Evaporator coil cleaning", 1], ["System commissioning", 1]],
  },
  capacitor: {
    good: [["Capacitor replacement", 1]],
    better: [["Capacitor replacement", 1], ["Contactor replacement", 1]],
    best: [["Capacitor replacement", 1], ["Contactor replacement", 1], ["Hard start kit", 1], ["AC tune-up", 1]],
  },
  igniter: {
    good: [["Igniter replacement", 1]],
    better: [["Igniter replacement", 1], ["Flame sensor cleaning or replacement", 1]],
    best: [["Igniter replacement", 1], ["Flame sensor cleaning or replacement", 1], ["Furnace tune-up", 1], ["Carbon monoxide detector", 1]],
  },
  leak: {
    good: [["Refrigerant leak detection", 1], ["Refrigerant recharge, R-410A", 3]],
    better: [["Refrigerant leak detection", 1], ["Refrigerant recharge, R-410A", 3], ["Filter drier", 1], ["Standard labor", 1]],
    best: [["Refrigerant leak detection", 1], ["Refrigerant recharge, R-410A", 4], ["Filter drier", 1], ["TXV replacement", 1], ["System commissioning", 1]],
  },
  fan: {
    good: [["Condenser fan motor replacement", 1]],
    better: [["Condenser fan motor replacement", 1], ["Capacitor replacement", 1]],
    best: [["Condenser fan motor replacement", 1], ["Capacitor replacement", 1], ["Contactor replacement", 1], ["AC tune-up", 1]],
  },
}

export const REVIEW_COMMENTS: Record<number, string[]> = {
  5: [
    "On time, explained everything, and the AC is ice cold again. Highly recommend.",
    "Fast, honest, and cleaned up after himself. Will use again.",
    "They found the problem in ten minutes and didn't try to upsell me. Thank you!",
    "Super professional. The text updates were a nice touch.",
    "Fixed it same day and the price matched the estimate exactly.",
    "Best HVAC experience I've had in Austin.",
    "Friendly and patient with my questions. Five stars.",
  ],
  4: ["Good service, took a little longer than quoted.", "Fixed the problem. Would have liked a bit more notice on arrival time."],
  3: ["Work was fine but I had to call twice to confirm the appointment."],
  2: ["Tech was nice but the invoice was higher than I expected."],
}

export const OFFICE_RESPONSES = [
  "Thanks for the feedback! We've added a reminder step so appointment confirmations go out automatically.",
  "We're sorry the invoice caught you off guard. We now send the estimate before any work starts. Please call us and we'll walk through it with you.",
]
