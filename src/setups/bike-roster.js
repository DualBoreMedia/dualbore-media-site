// Reference placeholders, NOT verified setup inventory or compatibility claims.
// Primary roster: https://oem.mxb-mods.com/mx-oem-v0-19-1-update/
// Model-update corrections: Fantic XXF 250/450 are 2025 in that release's changelog.
// Cross-check: https://oem.mxb-mods.com/tga-list/ and /official-gfx/.
export const BIKE_ROSTER_SOURCE = 'https://oem.mxb-mods.com/mx-oem-v0-19-1-update/';
export const BIKE_ROSTER_VERSION = 'MX OEM v0.19.1';
const groups = {
  Alta: [['Redshift MXR',2018]],
  Beta: [['RX 450 4T',2025],['RX 300 2T',2023]],
  Fantic: [['XX 125',2023],['XX 250',2023],['XXF 250',2025],['XXF 450',2025]],
  GasGas: [['MC 125',2024],['MC 250',2024],['MCF 250',2024],['MCF 350',2024],['MCF 450',2024]],
  Honda: [['CR 125',1996],['CR 250',1996],['CR 250',1997],['CR 500 (Service Honda)',2008],['CRF 250',2023],['CRF 450',2023]],
  Husqvarna: [['TC 125',2023],['TC 250',2023],['TCF 250',2023],['TCF 350',2023],['TCF 450',2023]],
  Kawasaki: [['KX 125',2002],['KX 250',2002],['KXF 250',2023],['KXF 450',2023]],
  KTM: [['SX 500 (Black Knight)',2021],['SX 125',2023],['SX 250',2023],['SX 300',2023],['SXF 250',2023],['SXF 350',2023],['SXF 450',2023]],
  Stark: [['Varg',2023]],
  Suzuki: [['RM 125',2003],['RM 250',2003],['RMZ 250',2023],['RMZ 450',2023]],
  TM: [['MX 125 2T',2023],['MX 144 2T',2023],['MX 250 2T',2023],['MX 300 2T',2023],['MX 250 4T',2023],['MX 300 4T',2023],['MX 450 4T',2023],['MX 530 4T',2023]],
  Triumph: [['TF 250-X',2024],['TF 450-RC',2025]],
  Yamaha: [['YZ 125',2023],['YZ 250',2023],['YZF 250',2024],['YZF 450',2023]],
};
export const BIKE_PLACEHOLDERS = Object.freeze(Object.entries(groups).flatMap(([brand, models]) =>
  models.map(([model, year]) => Object.freeze({
    id: [brand,model,year].join('-').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/-$/,''),
    brand, model, year, name: `${year} ${brand} ${model}`, status: 'placeholder',
  }))));

export function filterBikePlaceholders({query='',brand='all'}={}) {
  const compact = value => String(value).toLowerCase().replace(/[^a-z0-9]/g,'');
  const terms = String(query).slice(0,100).trim().split(/\s+/).filter(Boolean).map(compact);
  return BIKE_PLACEHOLDERS.filter(bike => (brand==='all'||bike.brand===brand)
    && terms.every(term=>compact(bike.name).includes(term)));
}
