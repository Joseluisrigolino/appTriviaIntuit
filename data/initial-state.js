export const DATASET_REVISION = 1;

const INITIAL_STATE = {
  version: 4,
  datasetRevision: DATASET_REVISION,
  settings: {
    maxWinners: 2
  },
  activeGameId: "2026-08-06-1786040111487",
  updatedAt: "2026-08-06T18:16:30.671Z",
  games: [
    {
      id: "2026-08-06-1786040111487",
      date: "2026-08-06",
      question: "¿Qué canción del italiano Domenico Modugno tuvo su alcance mundial en 1958?",
      answer: "",
      caption: "El nombre original de la canción no es como se conoce la misma popularmente.",
      categoryId: "category-1786040028172-3499e",
      category: "Cambalache",
      bonusPercent: 0,
      clues: [
        {
          text: "Cancion en italiano",
          revealed: false
        }
      ],
      status: "completed",
      winner: "Sebastian Romano",
      winners: ["Sebastian Romano"],
      unanswered: false,
      pointsAwarded: 20,
      winnerAwards: [{ name: "Sebastian Romano", points: 20 }],
      pointsPerWinner: 20,
      completedAt: "2026-08-06T18:16:30.671Z",
      publishedAt: "2026-08-06T18:15:39.290Z"
    }
  ],
  categories: [
    {
      id: "category-1786040028172-3499e",
      name: "Cambalache",
      bonusPercent: 0
    },
    {
      id: "category-1786040044095-w3pbv",
      name: "Deportes",
      bonusPercent: 0
    }
  ]
};

export const createInitialState = () => JSON.parse(JSON.stringify(INITIAL_STATE));
