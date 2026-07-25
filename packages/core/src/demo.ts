import { calculateOverallConfidence, scoreClaim } from "./scoring.js";
import type {
  Claim,
  Contradiction,
  EvidenceLink,
  ReportSummary,
  ResearchRun,
  ResearchTask,
  Source
} from "./types.js";

const retrievedAt = "2026-07-25T08:00:00.000Z";

export const demoTasks: ResearchTask[] = [
  {
    id: "task-lifecycle",
    title: "Lifecycle assessment",
    objective: "Compare manufacturing, operation, and end-of-life emissions.",
    sourceKinds: ["academic", "government"],
    searchQueries: ["electric vehicle lifecycle emissions assessment"],
    status: "pending",
    sourceCount: 0
  },
  {
    id: "task-grid",
    title: "Electricity mix",
    objective: "Measure how regional electricity generation changes the result.",
    sourceKinds: ["government", "academic"],
    searchQueries: ["EV lifecycle emissions electricity grid mix"],
    status: "pending",
    sourceCount: 0
  },
  {
    id: "task-battery",
    title: "Battery production",
    objective: "Investigate battery manufacturing and break-even distance.",
    sourceKinds: ["academic", "official"],
    searchQueries: ["battery production emissions EV break even distance"],
    status: "pending",
    sourceCount: 0
  }
];

export const demoSources: Source[] = [
  {
    id: "source-iea",
    title: "Global EV Outlook 2024",
    url: "https://www.iea.org/reports/global-ev-outlook-2024",
    publisher: "International Energy Agency",
    publishedAt: "2024-04-23",
    retrievedAt,
    kind: "official",
    qualityScore: 92,
    qualityReasons: [
      "International energy authority.",
      "Methodology and underlying analysis are published.",
      "Directly relevant to lifecycle emissions."
    ],
    independenceGroup: "iea-global-ev-outlook-2024"
  },
  {
    id: "source-epa",
    title: "Electric Vehicle Myths",
    url: "https://www.epa.gov/greenvehicles/electric-vehicle-myths",
    publisher: "United States Environmental Protection Agency",
    publishedAt: "2024-01-01",
    retrievedAt,
    kind: "government",
    qualityScore: 90,
    qualityReasons: [
      "Government environmental authority.",
      "Uses lifecycle analysis rather than tailpipe emissions alone."
    ],
    independenceGroup: "us-epa-ev-myths"
  },
  {
    id: "source-icct",
    title: "A global comparison of the life-cycle greenhouse gas emissions of combustion engine and electric passenger cars",
    url: "https://theicct.org/publication/a-global-comparison-of-the-life-cycle-greenhouse-gas-emissions-of-combustion-engine-and-electric-passenger-cars/",
    publisher: "International Council on Clean Transportation",
    publishedAt: "2021-07-20",
    retrievedAt,
    kind: "academic",
    qualityScore: 89,
    qualityReasons: [
      "Detailed lifecycle methodology.",
      "Regional electricity scenarios are compared."
    ],
    independenceGroup: "icct-global-lca-2021"
  },
  {
    id: "source-doe",
    title: "Emissions from Electric Vehicles",
    url: "https://afdc.energy.gov/vehicles/electric-emissions",
    publisher: "U.S. Department of Energy",
    retrievedAt,
    kind: "government",
    qualityScore: 87,
    qualityReasons: [
      "Government energy data.",
      "Explicitly compares regional electricity-generation effects."
    ],
    independenceGroup: "us-doe-afdc-emissions"
  },
  {
    id: "source-volvo",
    title: "Carbon footprint report: C40 Recharge",
    url: "https://www.volvocars.com/images/v/-/media/market-assets/intl/applications/dotcom/pdf/c40/volvo-c40-recharge-lca-report.pdf",
    publisher: "Volvo Cars",
    publishedAt: "2021-11-01",
    retrievedAt,
    kind: "official",
    qualityScore: 71,
    qualityReasons: [
      "First-party product lifecycle report.",
      "Relevant methodology is disclosed.",
      "Commercial conflict of interest lowers independence."
    ],
    independenceGroup: "volvo-c40-lca"
  }
];

export const demoEvidence: EvidenceLink[] = [
  {
    id: "ev-1",
    claimId: "claim-lifecycle",
    sourceId: "source-epa",
    excerpt:
      "The greenhouse gas emissions associated with an electric vehicle over its lifetime are typically lower than those from an average gasoline-powered vehicle, even when accounting for manufacturing.",
    relation: "supports",
    directness: 98,
    contextualMatch: 94,
    rationale: "Direct lifecycle comparison including vehicle manufacturing."
  },
  {
    id: "ev-2",
    claimId: "claim-lifecycle",
    sourceId: "source-doe",
    excerpt:
      "In geographic areas that use relatively low-polluting energy sources for electricity generation, all-electric vehicles and PHEVs typically have an especially large life cycle emissions advantage over similar conventional vehicles running on gasoline or diesel.",
    relation: "supports",
    directness: 91,
    contextualMatch: 88,
    rationale:
      "Direct lifecycle comparison with an explicit electricity-mix qualification."
  },
  {
    id: "ev-3",
    claimId: "claim-manufacturing",
    sourceId: "source-epa",
    excerpt:
      "Some studies have shown that making a typical EV can create more carbon pollution than making a gasoline car. This is because of the additional energy required to manufacture an EV’s battery.",
    relation: "supports",
    directness: 95,
    contextualMatch: 92,
    rationale:
      "Directly compares manufacturing emissions and identifies the battery contribution."
  },
  {
    id: "ev-4",
    claimId: "claim-grid",
    sourceId: "source-epa",
    excerpt:
      "Generating the electricity used to charge EVs, however, may create carbon pollution. The amount varies widely based on how local power is generated, e.g., using coal or natural gas, which emit carbon pollution, versus renewable resources like wind or solar, which do not.",
    relation: "supports",
    directness: 97,
    contextualMatch: 95,
    rationale: "Directly establishes regional grid dependence."
  },
  {
    id: "ev-5",
    claimId: "claim-grid",
    sourceId: "source-doe",
    excerpt:
      "In areas with higher-emissions electricity, all-electric vehicles and PHEVs may not demonstrate as strong a life cycle emissions benefit.",
    relation: "supports",
    directness: 94,
    contextualMatch: 94,
    rationale: "Directly supports the regional qualification."
  },
  {
    id: "ev-6",
    claimId: "claim-break-even",
    sourceId: "source-epa",
    excerpt:
      "Emissions will vary based on assumptions about the specific vehicles being compared, EV battery size and chemistry, vehicle lifetimes, and the electricity grid used to recharge the EV, among other factors.",
    relation: "supports",
    directness: 91,
    contextualMatch: 89,
    rationale:
      "Lists multiple variables that prevent a universal lifecycle threshold."
  },
  {
    id: "ev-7",
    claimId: "claim-break-even",
    sourceId: "source-doe",
    excerpt:
      "In areas with higher-emissions electricity, all-electric vehicles and PHEVs may not demonstrate as strong a life cycle emissions benefit.",
    relation: "supports",
    directness: 82,
    contextualMatch: 84,
    rationale:
      "Shows that the lifecycle result changes with the charging context."
  }
];

function buildClaim(
  base: Omit<Claim, "confidence" | "status" | "scoreBreakdown">,
  completeness: number,
  timeRelevance: number,
  contextDependent = false
): Claim {
  const result = scoreClaim({
    evidence: demoEvidence.filter((evidence) => evidence.claimId === base.id),
    sources: demoSources,
    completeness,
    timeRelevance,
    contextDependent
  });
  return {
    ...base,
    confidence: result.confidence,
    status: result.status,
    scoreBreakdown: result.breakdown
  };
}

export const demoClaims: Claim[] = [
  buildClaim(
    {
      id: "claim-lifecycle",
      text: "Battery-electric passenger cars generally produce lower lifecycle greenhouse-gas emissions than comparable petrol cars.",
      subject: "Battery-electric passenger cars",
      predicate: "produce lower lifecycle greenhouse-gas emissions than",
      value: "comparable petrol cars",
      timeContext: "vehicles sold under current and projected electricity mixes",
      locationContext: "multiple global regions",
      qualifiers: ["generally", "comparable vehicles", "full lifecycle"],
      importance: "high"
    },
    92,
    88
  ),
  buildClaim(
    {
      id: "claim-manufacturing",
      text: "Manufacturing a battery-electric vehicle can create more emissions than manufacturing a comparable petrol vehicle.",
      subject: "Battery-electric vehicle manufacturing",
      predicate: "can create more emissions than",
      value: "petrol vehicle manufacturing",
      qualifiers: ["primarily because of battery production"],
      importance: "high"
    },
    72,
    72
  ),
  buildClaim(
    {
      id: "claim-grid",
      text: "The size of an electric vehicle's lifecycle advantage depends strongly on the electricity used for charging.",
      subject: "Electric vehicle lifecycle advantage",
      predicate: "depends on",
      value: "electricity generation mix",
      locationContext: "region of vehicle charging",
      qualifiers: ["regional", "carbon intensity"],
      importance: "high"
    },
    88,
    86
  ),
  buildClaim(
    {
      id: "claim-break-even",
      text: "There is no single universal emissions break-even distance for every electric vehicle.",
      subject: "Electric vehicle emissions break-even distance",
      predicate: "is not",
      value: "a universal fixed distance",
      qualifiers: ["vehicle size", "battery production", "electricity mix"],
      importance: "medium"
    },
    66,
    72,
    true
  )
];

export const demoContradictions: Contradiction[] = [
  {
    id: "contradiction-break-even",
    claimId: "claim-break-even",
    supportingEvidenceId: "ev-6",
    contradictingEvidenceId: "ev-7",
    sameContext: false,
    contextDifferences: [
      "Low-emissions electricity can produce an especially large lifecycle advantage.",
      "Higher-emissions electricity may produce a smaller lifecycle benefit."
    ],
    explanation:
      "The sources describe different outcomes under different charging contexts. This is not a direct contradiction; it is evidence that a universal lifecycle threshold would be misleading.",
    impact: "medium"
  }
];

export const demoReport: ReportSummary = {
  headline: "Electric vehicles usually have a lifecycle emissions advantage, with important regional and manufacturing qualifications.",
  executiveSummary:
    "The collected government, research, and official lifecycle evidence supports the conclusion that battery-electric passenger cars generally produce fewer greenhouse-gas emissions over their full lifetime than comparable petrol cars. Their manufacturing emissions can be higher, especially because of battery production, while the eventual advantage depends on the electricity used for charging and the characteristics of the vehicles compared.",
  conclusion:
    "The available evidence supports a conditional yes: electric vehicles are generally environmentally preferable when the comparison covers lifecycle greenhouse-gas emissions, but the size and timing of the benefit vary. The evidence does not support one universal break-even distance for every vehicle and region.",
  limitations: [
    "This demo focuses on greenhouse-gas emissions rather than every environmental impact.",
    "Battery mineral extraction, local air pollution, water use, and recycling require separate evaluation.",
    "The result depends on vehicle class, lifetime mileage, battery production, and regional electricity generation."
  ],
  recommendations: [
    "Compare vehicles of similar size and expected lifetime mileage.",
    "Use regional electricity-generation data when making a local decision.",
    "Treat fixed break-even distance claims as context-dependent."
  ],
  overallConfidence: calculateOverallConfidence(demoClaims)
};

export function createResearchRun(
  id: string,
  query: string,
  mode: "demo" | "live"
): ResearchRun {
  const timestamp = new Date().toISOString();
  return {
    id,
    query,
    normalizedQuestion: query,
    mode,
    status: "queued",
    scope: {
      location: "Not yet determined",
      timePeriod: "Not yet determined",
      population: "Not yet determined",
      assumptions: []
    },
    tasks: [],
    sources: [],
    claims: [],
    evidence: [],
    contradictions: [],
    events: [],
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function createDemoRun(id: string, query: string): ResearchRun {
  const run = createResearchRun(id, query, "demo");
  run.normalizedQuestion =
    "Are battery-electric passenger cars environmentally preferable to comparable petrol cars across their full lifecycle?";
  run.scope = {
    location: "Multiple global regions",
    timePeriod: "Recent lifecycle evidence",
    population: "Comparable passenger vehicles",
    assumptions: [
      "Environmental comparison primarily means lifecycle greenhouse-gas emissions.",
      "Vehicles are compared within a broadly similar size and use category."
    ]
  };
  run.tasks = demoTasks.map((task) => ({ ...task }));
  return run;
}
