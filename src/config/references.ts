/**
 * Literature referenced by the parameter notes and the Science page.
 * Only facts actually used in the model are cited; see PARAM_NOTES in params.ts.
 */
export interface Reference {
  key: string;
  authors: string;
  year: number;
  title: string;
  venue: string;
  url: string;
}

export const REFERENCES: Record<string, Reference> = {
  cardDickinson2008jeb: {
    key: 'cardDickinson2008jeb',
    authors: 'Card G, Dickinson M',
    year: 2008,
    title: 'Performance trade-offs in the flight initiation of Drosophila',
    venue: 'Journal of Experimental Biology 211(3):341–353',
    url: 'https://doi.org/10.1242/jeb.012682',
  },
  cardDickinson2008cb: {
    key: 'cardDickinson2008cb',
    authors: 'Card G, Dickinson MH',
    year: 2008,
    title: 'Visually mediated motor planning in the escape response of Drosophila',
    venue: 'Current Biology 18(17):1300–1307',
    url: 'https://doi.org/10.1016/j.cub.2008.07.094',
  },
  vonReyn2014: {
    key: 'vonReyn2014',
    authors: 'von Reyn CR, Breads P, Peek MY, Zheng GZ, Williamson WR, Yee AL, Leonardo A, Card GM',
    year: 2014,
    title: 'A spike-timing mechanism for action selection',
    venue: 'Nature Neuroscience 17(7):962–970',
    url: 'https://doi.org/10.1038/nn.3741',
  },
  vonReyn2017: {
    key: 'vonReyn2017',
    authors: 'von Reyn CR, Nern A, Williamson WR, Breads P, Wu M, Namiki S, Card GM',
    year: 2017,
    title: 'Feature integration drives probabilistic behavior in the Drosophila escape response',
    venue: 'Neuron 94(6):1190–1204',
    url: 'https://doi.org/10.1016/j.neuron.2017.05.036',
  },
  klapoetke2017: {
    key: 'klapoetke2017',
    authors: 'Klapoetke NC, Nern A, Peek MY, Rogers EM, Breads P, Rubin GM, Reiser MB, Card GM',
    year: 2017,
    title: 'Ultra-selective looming detection from radial motion opponency',
    venue: 'Nature 551:237–241',
    url: 'https://doi.org/10.1038/nature24626',
  },
  ache2019: {
    key: 'ache2019',
    authors: 'Ache JM, Polsky J, Alghailani S, Parekh R, Breads P, Peek MY, Bock DD, von Reyn CR, Card GM',
    year: 2019,
    title: 'Neural basis for looming size and velocity encoding in the Drosophila giant fiber escape pathway',
    venue: 'Current Biology 29(6):1073–1081',
    url: 'https://doi.org/10.1016/j.cub.2019.01.079',
  },
  muijres2014: {
    key: 'muijres2014',
    authors: 'Muijres FT, Elzinga MJ, Melis JM, Dickinson MH',
    year: 2014,
    title: 'Flies evade looming targets by executing rapid visually directed banked turns',
    venue: 'Science 344(6180):172–177',
    url: 'https://doi.org/10.1126/science.1248955',
  },
  fry2003: {
    key: 'fry2003',
    authors: 'Fry SN, Sayaman R, Dickinson MH',
    year: 2003,
    title: 'The aerodynamics of free-flight maneuvers in Drosophila',
    venue: 'Science 300(5618):495–498',
    url: 'https://doi.org/10.1126/science.1081944',
  },
  mendes2013: {
    key: 'mendes2013',
    authors: 'Mendes CS, Bartos I, Akay T, Márka S, Mann RS',
    year: 2013,
    title: 'Quantification of gait parameters in freely walking wild type and sensory deprived Drosophila melanogaster',
    venue: 'eLife 2:e00231',
    url: 'https://doi.org/10.7554/eLife.00231',
  },
  dorkenwald2024: {
    key: 'dorkenwald2024',
    authors: 'Dorkenwald S, Matsliah A, Sterling AR, et al. (FlyWire Consortium)',
    year: 2024,
    title: 'Neuronal wiring diagram of an adult brain',
    venue: 'Nature 634:124–138',
    url: 'https://doi.org/10.1038/s41586-024-07558-y',
  },
  schlegel2024: {
    key: 'schlegel2024',
    authors: 'Schlegel P, Yin Y, Bates AS, et al.',
    year: 2024,
    title: 'Whole-brain annotation and multi-connectome cell typing of Drosophila',
    venue: 'Nature 634:139–152',
    url: 'https://doi.org/10.1038/s41586-024-07686-5',
  },
  augustin2019: {
    key: 'augustin2019',
    authors: 'Augustin H, Zylbertal A, Partridge L',
    year: 2019,
    title: 'A computational model of the escape response latency in the Giant Fiber System of Drosophila melanogaster',
    venue: 'eNeuro 6(2)',
    url: 'https://doi.org/10.1523/ENEURO.0423-18.2019',
  },
};
