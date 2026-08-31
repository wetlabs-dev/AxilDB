import { prisma } from '@/lib/prisma'

type DefinitionInput = {
  code: string
  genus: string
  species: string
  hybridNotation?: string
  cultivarName?: string
  authority?: string
  confidence?: string
  acquisitionLabel?: string
  provisionalTaxon?: string
  wikipediaUrl?: string
  inaturalistUrl?: string
  powoUrl?: string
  gbifUrl?: string
  description: string
  aliases?: Array<{
    name: string
    aliasType: string
    confidence?: string
    source?: string
  }>
}

const d = (value: string) => new Date(`${value}T12:00:00.000Z`)

const taxonomyLinks = {
  dracaena: {
    wikipediaUrl: 'https://en.wikipedia.org/wiki/Dracaena_trifasciata',
    inaturalistUrl: 'https://www.inaturalist.org/taxa/67767-Dracaena-trifasciata',
    powoUrl: 'https://powo.science.kew.org/results?q=Dracaena%20trifasciata',
    gbifUrl: 'https://www.gbif.org/species/search?q=Dracaena%20trifasciata',
  },
  monstera: {
    wikipediaUrl: 'https://en.wikipedia.org/wiki/Monstera_deliciosa',
    inaturalistUrl: 'https://www.inaturalist.org/taxa/50312-Monstera-deliciosa',
    powoUrl: 'https://powo.science.kew.org/results?q=Monstera%20deliciosa',
    gbifUrl: 'https://www.gbif.org/species/search?q=Monstera%20deliciosa',
  },
  phragmipedium: {
    wikipediaUrl: 'https://en.wikipedia.org/wiki/Phragmipedium_besseae',
    inaturalistUrl: 'https://www.inaturalist.org/taxa/search?q=Phragmipedium%20besseae',
    powoUrl: 'https://powo.science.kew.org/results?q=Phragmipedium%20besseae',
    gbifUrl: 'https://www.gbif.org/species/search?q=Phragmipedium%20besseae',
  },
  streptocarpus: {
    wikipediaUrl: 'https://en.wikipedia.org/wiki/Streptocarpus_ionanthus',
    inaturalistUrl: 'https://www.inaturalist.org/taxa/search?q=Streptocarpus%20ionanthus',
    powoUrl: 'https://powo.science.kew.org/results?q=Streptocarpus%20ionanthus',
    gbifUrl: 'https://www.gbif.org/species/search?q=Streptocarpus%20ionanthus',
  },
  begonia: {
    wikipediaUrl: 'https://en.wikipedia.org/wiki/Begonia_maculata',
    inaturalistUrl: 'https://www.inaturalist.org/taxa/search?q=Begonia%20maculata',
    powoUrl: 'https://powo.science.kew.org/results?q=Begonia%20maculata',
    gbifUrl: 'https://www.gbif.org/species/search?q=Begonia%20maculata',
  },
  hoya: {
    wikipediaUrl: 'https://en.wikipedia.org/wiki/Hoya_carnosa',
    inaturalistUrl: 'https://www.inaturalist.org/taxa/127438-Hoya-carnosa',
    powoUrl: 'https://powo.science.kew.org/results?q=Hoya%20carnosa',
    gbifUrl: 'https://www.gbif.org/species/search?q=Hoya%20carnosa',
  },
  cattleya: {
    wikipediaUrl: 'https://en.wikipedia.org/wiki/Cattleya_trianae',
    inaturalistUrl: 'https://www.inaturalist.org/taxa/search?q=Cattleya%20trianae',
    powoUrl: 'https://powo.science.kew.org/results?q=Cattleya%20trianae',
    gbifUrl: 'https://www.gbif.org/species/search?q=Cattleya%20trianae',
  },
}

const definitions: DefinitionInput[] = [
  {
    code: 'DTR',
    genus: 'Dracaena',
    species: 'trifasciata',
    authority: '(Prain) Mabb.',
    confidence: 'PROBABLE',
    acquisitionLabel: 'Sansevieria zeylanica',
    provisionalTaxon: 'Dracaena zeylanica',
    description: 'Rhizomatous houseplant lineage used to demonstrate cautious taxonomy and division records.',
    aliases: [
      { name: 'Sansevieria trifasciata', aliasType: 'OBSOLETE_TAXONOMY', confidence: 'CONFIRMED', source: 'Common horticultural label' },
      { name: 'Snake Plant', aliasType: 'COMMON_NAME', confidence: 'CONFIRMED' },
      { name: "Mother-in-law's Tongue", aliasType: 'COMMON_NAME', confidence: 'PROBABLE' },
    ],
    ...taxonomyLinks.dracaena,
  },
  {
    code: 'MON',
    genus: 'Monstera',
    species: 'deliciosa',
    authority: 'Liebm.',
    confidence: 'CONFIRMED',
    description: 'Aroid specimen with node cutting propagations and location changes.',
    aliases: [{ name: 'Swiss cheese plant', aliasType: 'COMMON_NAME', confidence: 'CONFIRMED' }],
    ...taxonomyLinks.monstera,
  },
  {
    code: 'PHR',
    genus: 'Phragmipedium',
    species: 'besseae',
    cultivarName: 'Morning Glow',
    confidence: 'CONFIRMED',
    acquisitionLabel: 'Phrag. besseae Morning Glow',
    description: 'Slipper orchid clone for bloom history, division, and accession label examples.',
    aliases: [{ name: 'Phrag. besseae', aliasType: 'SHORTHAND', confidence: 'CONFIRMED' }],
    ...taxonomyLinks.phragmipedium,
  },
  {
    code: 'STR',
    genus: 'Streptocarpus',
    species: 'ionanthus',
    cultivarName: 'Demo Starfall',
    confidence: 'PROBABLE',
    acquisitionLabel: 'Saintpaulia ionantha Demo Starfall',
    provisionalTaxon: 'Saintpaulia ionantha',
    description: 'African violet-style demo cultivar with leaf propagation and sport tracking.',
    aliases: [
      { name: 'African violet', aliasType: 'COMMON_NAME', confidence: 'CONFIRMED' },
      { name: 'Saintpaulia ionantha', aliasType: 'OBSOLETE_TAXONOMY', confidence: 'PROBABLE' },
    ],
    ...taxonomyLinks.streptocarpus,
  },
  {
    code: 'BEG',
    genus: 'Begonia',
    species: 'maculata',
    authority: 'Raddi',
    confidence: 'CONFIRMED',
    description: 'Cane begonia used for cutting and bloom-note examples.',
    aliases: [{ name: 'Polka dot begonia', aliasType: 'COMMON_NAME', confidence: 'CONFIRMED' }],
    ...taxonomyLinks.begonia,
  },
  {
    code: 'BGL',
    genus: 'Begonia',
    species: '',
    cultivarName: 'Looking Glass',
    confidence: 'CONFIRMED',
    description: 'Blank-species horticultural cultivar used to exercise genus-level cultivar selection.',
    aliases: [{ name: "Begonia 'Looking Glass'", aliasType: 'TRADE_NAME', confidence: 'CONFIRMED' }],
  },
  {
    code: 'BSP',
    genus: 'Begonia',
    species: 'sp.',
    confidence: 'UNCERTAIN',
    provisionalTaxon: 'Begonia sp.',
    description: 'Unknown-species Begonia used to keep sp. distinct from intentionally blank species.',
  },
  {
    code: 'ALO',
    genus: 'Alocasia',
    species: 'macrorrhizos',
    confidence: 'PROBABLE',
    description: 'Aroid corm example for lifecycle-stage accession tracking.',
  },
  {
    code: 'PTC',
    genus: 'Philodendron',
    species: 'sp.',
    cultivarName: 'Demo TC',
    confidence: 'UNCERTAIN',
    provisionalTaxon: 'Philodendron sp. Demo TC',
    description: 'Individual tissue-culture accession example for deflask and acclimation tracking.',
  },
  {
    code: 'HOY',
    genus: 'Hoya',
    species: 'carnosa',
    authority: '(L.f.) R.Br.',
    confidence: 'CONFIRMED',
    acquisitionLabel: 'Hoya carnosa splash',
    description: 'Wax plant basket used for cutting propagation and source tracking examples.',
    aliases: [{ name: 'Wax plant', aliasType: 'COMMON_NAME', confidence: 'CONFIRMED' }],
    ...taxonomyLinks.hoya,
  },
  {
    code: 'CAT',
    genus: 'Cattleya',
    species: 'trianae',
    authority: 'Linden & Rchb.f.',
    confidence: 'PROBABLE',
    description: 'Orchid specimen for bloom and provenance examples.',
    aliases: [{ name: 'Christmas orchid', aliasType: 'COMMON_NAME', confidence: 'PROBABLE' }],
    ...taxonomyLinks.cattleya,
  },
]

export async function createDemoData(collectionId: string) {
  const batch = `DEMO-${new Date().toISOString().replace(/[-:]/g, '').slice(0, 13)}`

  const avsa = await prisma.taxonomicAuthority.upsert({
    where: { id: `demo-avsa-${collectionId}` },
    update: {},
    create: {
      id: `demo-avsa-${collectionId}`,
      collectionId,
      name: 'African Violet Society of America',
      abbreviation: 'AVSA',
      authorityType: 'ICRA',
      website: 'https://africanvioletsocietyofamerica.org/',
      notes: 'Demo taxonomic authority used by sample data.',
      scopeRules: { create: [{ rank: 'GENUS', taxonName: 'Streptocarpus' }, { rank: 'SECTION', taxonName: 'Saintpaulia' }] },
    },
  })

  const definitionsByCode = new Map<string, { id: string }>()

  for (const item of definitions) {
    const definition = await prisma.plantDefinition.create({
      data: {
        collectionId,
        genus: item.genus,
        species: item.species,
        hybridNotation: item.hybridNotation,
        cultivarName: item.cultivarName,
        authority: item.authority,
        confidence: item.confidence || 'CONFIRMED',
        provisionalTaxon: item.provisionalTaxon,
        identificationStatus: item.provisionalTaxon ? 'PROVISIONAL' : 'IDENTIFIED',
        wikipediaUrl: item.wikipediaUrl,
        inaturalistUrl: item.inaturalistUrl,
        powoUrl: item.powoUrl,
        gbifUrl: item.gbifUrl,
        taxonomicAuthorityId: item.code === 'STR' ? avsa.id : undefined,
        taxonomicAuthoritySource: item.code === 'STR' ? 'MANUAL' : 'AUTO',
        taxonomicAuthorityMatchReason: item.code === 'STR' ? 'Demo data manual selection' : undefined,
        description: `${item.description} Batch ${batch}.`,
        notes: `Sample record generated for app evaluation in ${batch}.`,
        aliases: { create: (item.aliases || []).map((alias) => ({ ...alias, collectionId })) },
      },
    })
    definitionsByCode.set(item.code, definition)
  }

  const demoTags = [
    { slug: 'geometric', name: 'Geometric', icon: 'shapes', category: 'LEAF_PATTERN', colorToken: 'sage', definitionCode: 'BEG', description: 'Strongly patterned or regularly arranged foliage.' },
    { slug: 'trailing', name: 'Trailing', icon: 'sprout', category: 'GROWTH_HABIT', colorToken: 'fern', definitionCode: 'HOY', description: 'Growth habit suited to trailing or hanging presentation.' },
    { slug: 'cat-safe', name: 'Cat Safe', icon: 'shield-check', category: 'PET_SAFETY', colorToken: 'sky', definitionCode: 'STR', description: 'Commonly regarded as non-toxic to cats; verify current authoritative guidance.' },
  ]
  for (const item of demoTags) {
    const tag = await prisma.plantTag.upsert({
      where: { collectionId_slug: { collectionId, slug: item.slug } },
      update: {},
      create: {
        collectionId,
        name: item.name,
        slug: item.slug,
        icon: item.icon,
        category: item.category,
        colorToken: item.colorToken,
        description: item.description,
        publicVisible: true,
      },
    })
    await prisma.plantDefinitionTag.createMany({
      data: [{ collectionId, plantDefinitionId: definitionsByCode.get(item.definitionCode)!.id, plantTagId: tag.id, source: 'SYSTEM' }],
      skipDuplicates: true,
    })
  }

  const guideDefaults: Record<string, Record<string, string>> = {
    DTR: {
      summaryWater: 'Water sparingly',
      summaryLight: 'Bright indirect to low light',
      summaryToxicity: 'Pet toxic',
      summaryCare: 'Tough rhizomatous houseplant; avoid soggy soil.',
      wateringCadence: 'Every 2-4 weeks, less in winter.',
      wateringMoistureLevel: 'Dry between waterings.',
      lightIntensity: 'Bright indirect, tolerant of lower light.',
      mediumPreferred: 'Fast-draining cactus or houseplant mix.',
      mediumDrainage: 'Excellent drainage is important.',
      toxicityPets: 'Toxic to cats and dogs if chewed.',
      growthHabit: 'Rhizomatous upright foliage.',
    },
    STR: {
      summaryWater: 'Keep evenly moist',
      summaryLight: 'Bright indirect light',
      summaryToxicity: 'Generally non-toxic to pets',
      summaryCare: 'Warm shelf culture with steady moisture and gentle fertilizer.',
      wateringCadence: 'Water when the surface begins to dry.',
      wateringMoistureLevel: 'Evenly moist, not waterlogged.',
      lightIntensity: 'Bright indirect light or moderate grow lights.',
      mediumPreferred: 'Light African violet mix with extra perlite.',
      fertilizationFrequency: 'Every 2-4 weeks while actively growing.',
      propagationMethods: 'Leaf cuttings.',
      propagationDifficulty: 'Easy to moderate.',
      growthHabit: 'Compact rosette.',
    },
    HOY: {
      summaryWater: 'Let dry partly',
      summaryLight: 'Bright indirect light',
      summaryToxicity: 'Milky sap may irritate',
      summaryCare: 'Epiphytic vine that prefers airflow, chunky medium, and restraint with watering.',
      wateringCadence: 'Water after the medium partly dries.',
      lightIntensity: 'Bright indirect; some gentle morning sun is helpful.',
      mediumHabit: 'Epiphytic or hemiepiphytic vine.',
      mediumPreferred: 'Chunky aroid/orchid-style mix.',
      toxicitySapIrritant: 'Milky sap can irritate skin.',
      growthHabit: 'Trailing or climbing vine.',
      bloomTriggers: 'Maturity, bright light, and stable care.',
    },
  }

  for (const [code, guide] of Object.entries(guideDefaults)) {
    const definition = definitionsByCode.get(code)
    if (!definition) continue
    await prisma.plantHusbandryGuide.create({
      data: {
        collectionId,
        plantDefinitionId: definition.id,
        reviewStatus: 'REVIEWED',
        ...guide,
      },
    })
  }

  const demoLocationType = await prisma.locationType.create({ data: { collectionId, name: 'Demo Growing Area', abbreviation: 'DEMO' } })
  const demoLocationNames = ['Demo bench', 'Sunroom pole', 'Greenhouse bench 2', 'Light shelf A', 'East window', 'Hanging basket rail', 'Greenhouse bench 1', 'Demo propagation tray']
  const demoLocations = new Map<string, string>()
  for (const [index, name] of demoLocationNames.entries()) {
    const location = await prisma.location.create({ data: { collectionId, locationTypeId: demoLocationType.id, name, code: `LOC-DEMO-${String(index + 1).padStart(2, '0')}`, sortOrder: index * 10 } })
    demoLocations.set(name, location.id)
  }

  const instance = async (code: string, suffix: string, data: Record<string, unknown>) => {
    const locationName = String(data.location || 'Demo bench')
    const { location: _location, ...instanceData } = data
    return prisma.plantInstance.create({
      data: {
        collectionId,
        plantDefinitionId: definitionsByCode.get(code)!.id,
        plantId: `${code}-${batch}-${suffix}`,
        instanceType: suffix.includes('P') || suffix.includes('C') || suffix.includes('D') ? 'PROPAGATION' : 'MOTHER',
        currentLocationId: demoLocations.get(locationName) || null,
        ...instanceData,
      } as any,
    })
  }

  const dtrMother = await instance('DTR', '001', {
    acquisitionDate: d('2024-02-14'),
    acquisitionLabel: definitions.find((item) => item.code === 'DTR')?.acquisitionLabel,
    source: 'Hypothetical neighborhood cutting',
    distributor: 'Local swap table',
    stockNumber: 'SWAP-42',
  })
  const monMother = await instance('MON', '001', {
    acquisitionDate: d('2023-09-03'),
    source: 'Demo Conservatory Shop',
    location: 'Sunroom pole',
  })
  const phrMother = await instance('PHR', '001', {
    acquisitionDate: d('2022-11-19'),
    acquisitionLabel: definitions.find((item) => item.code === 'PHR')?.acquisitionLabel,
    source: 'Hypothetical orchid nursery',
    location: 'Greenhouse bench 2',
    purchasePrice: '65.00',
  })
  const strMother = await instance('STR', '001', {
    acquisitionDate: d('2025-03-18'),
    acquisitionLabel: definitions.find((item) => item.code === 'STR')?.acquisitionLabel,
    source: 'Demo violet show',
    location: 'Light shelf A',
  })
  const begMother = await instance('BEG', '001', {
    acquisitionDate: d('2024-07-09'),
    source: 'Hypothetical garden center',
    location: 'East window',
  })
  const hoyMother = await instance('HOY', '001', {
    acquisitionDate: d('2024-05-21'),
    acquisitionLabel: definitions.find((item) => item.code === 'HOY')?.acquisitionLabel,
    source: 'Demo online seller',
    distributor: 'WetLabs sample import',
    location: 'Hanging basket rail',
  })
  const catMother = await instance('CAT', '001', {
    acquisitionDate: d('2023-12-06'),
    source: 'Hypothetical orchid society auction',
    location: 'Greenhouse bench 1',
  })
  const begSeed = await instance('BGL', 'SD-001', {
    instanceType: 'SEED',
    acquisitionDate: d('2026-02-01'),
    sownAt: d('2026-02-05'),
    germinatedAt: d('2026-02-18'),
    source: 'Demo seed exchange',
    location: 'Demo propagation tray',
  })
  const begUnknown = await instance('BSP', '001', {
    acquisitionDate: d('2025-12-14'),
    source: 'Unknown demo cutting',
    location: 'Demo bench',
  })
  const alocasiaCorm = await instance('ALO', 'CO-001', {
    instanceType: 'CORM',
    acquisitionDate: d('2026-03-10'),
    cormStartedAt: d('2026-03-12'),
    source: 'Demo corm division',
    location: 'Greenhouse bench 1',
  })
  const philodendronTc = await instance('PTC', 'TC-001', {
    instanceType: 'TISSUE_CULTURE',
    acquisitionDate: d('2026-04-01'),
    deflaskedAt: d('2026-04-07'),
    source: 'Demo tissue culture lab',
    location: 'Light shelf A',
  })

  const createdInstances = [dtrMother, monMother, phrMother, strMother, begMother, hoyMother, catMother, begSeed, begUnknown, alocasiaCorm, philodendronTc]

  async function propagation(parent: typeof dtrMother, code: string, method: string, date: string, childSuffixes: string[], notes: string, childData: Record<string, unknown> = {}) {
    const event = await prisma.propagationEvent.create({
      data: {
        collectionId,
        method,
        date: d(date),
        successStatus: 'SUCCESS',
        notes,
        parents: { create: { parentPlantInstanceId: parent.id, parentRole: 'SOURCE_PARENT' } },
      },
    })

    for (const suffix of childSuffixes) {
      const child = await instance(code, suffix, {
        propagationDate: d(date),
        location: 'Demo propagation tray',
        ...childData,
      })
      createdInstances.push(child)
      await prisma.propagationChild.create({ data: { propagationEventId: event.id, childPlantInstanceId: child.id } })
    }
    return event
  }

  await propagation(dtrMother, 'DTR', 'DIVISION', '2025-01-12', ['D1', 'D2'], 'Rhizome split into two sturdy divisions.')
  await propagation(monMother, 'MON', 'CUTTING', '2025-02-08', ['C1', 'C2'], 'Two node cuttings rooted in water and moved to aroid mix.')
  await propagation(phrMother, 'PHR', 'DIVISION', '2025-03-22', ['D1', 'D2'], 'Repot division after flowering cycle.')
  await propagation(begMother, 'BEG', 'CUTTING', '2025-04-16', ['C1', 'C2', 'C3'], 'Three cane cuttings, two initially vigorous.')
  await propagation(hoyMother, 'HOY', 'CUTTING', '2025-05-05', ['C1', 'C2'], 'Two vine cuttings started in perlite.')

  const violetLeaf = await propagation(strMother, 'STR', 'LEAF', '2025-06-10', ['P1', 'P2', 'P3'], 'Leaf pull produced three plantlets; P2 shows unusually bright variegation.')
  const sport = createdInstances.find((plant) => plant.plantId.endsWith('-P2'))!
  await prisma.plantInstance.update({
    where: { id: sport.id },
    data: {
      isSportCandidate: true,
      sportStatus: 'CANDIDATE',
      sportDescription: 'Hypothetical sport candidate with stronger leaf variegation than sibling plantlets.',
    },
  })

  const violetSport = await propagation(sport, 'STR', 'LEAF', '2025-10-02', ['P2-G2A', 'P2-G2B'], 'Second generation leaf propagation from sport candidate.', {
    isSportCandidate: true,
    sportStatus: 'SUSPECTED',
    sportDescription: 'Watching for repeat variegation pattern.',
  })

  await prisma.sportStabilityRecord.createMany({
    data: [
      { plantInstanceId: sport.id, propagationEventId: violetLeaf.id, propagatedTrue: true, generationNumber: 1, notes: 'Original candidate retained pattern after maturity.' },
      { plantInstanceId: sport.id, propagationEventId: violetSport.id, propagatedTrue: true, generationNumber: 2, notes: 'Two second-generation plantlets appear consistent.' },
    ],
  })

  await prisma.bloomEvent.createMany({
    data: [
      { collectionId, plantInstanceId: phrMother.id, bloomStartDate: d('2025-04-28'), peakBloomDate: d('2025-05-08'), bloomEndDate: d('2025-05-19'), flowerCount: 2, firstBloom: false, notes: 'Clean orange pouch, strong presentation.' },
      { collectionId, plantInstanceId: catMother.id, bloomStartDate: d('2025-12-12'), peakBloomDate: d('2025-12-20'), bloomEndDate: d('2026-01-02'), flowerCount: 3, firstBloom: true, notes: 'First bloom in collection.' },
      { collectionId, plantInstanceId: strMother.id, bloomStartDate: d('2025-08-03'), peakBloomDate: d('2025-08-11'), bloomEndDate: d('2025-08-24'), flowerCount: 14, firstBloom: false, notes: 'Compact violet flush under lights.' },
      { collectionId, plantInstanceId: begMother.id, bloomStartDate: d('2025-09-01'), peakBloomDate: d('2025-09-13'), flowerCount: 24, firstBloom: true, notes: 'Pending closure; active bloom demo.' },
    ],
  })

  await prisma.note.createMany({
    data: [
      { collectionId, entityType: 'PLANT_INSTANCE', entityId: dtrMother.id, note: 'Demo note: seller label retained even though accepted taxonomy differs.' },
      { collectionId, entityType: 'PLANT_INSTANCE', entityId: sport.id, note: 'Demo note: compare leaf pattern against P1 and P3 before declaring stable.' },
      { collectionId, entityType: 'PLANT_INSTANCE', entityId: monMother.id, note: 'Demo note: pole attachment improved after moving closer to east window.' },
    ],
  })

  return {
    batch,
    plantDefinitions: definitions.length,
    plantInstances: createdInstances.length,
    propagationEvents: 7,
    bloomEvents: 4,
  }
}
