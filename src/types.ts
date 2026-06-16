export type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  stock: number;
};

export type User = {
  id: string;
  name: string;
  email: string;
  points: number;
  openBanking?: {
    enabled: boolean;
    connectedBanks: string[];
    permissions: string[];
  };
  financialProfile?: {
    mainBank: string;
    accounts: Array<{
      bank: string;
      accountType: string;
      balance: number;
      currency: string;
      investedAmount?: number;
      currentInvestmentValue?: number;
      investments: Array<{
        id: string;
        name: string;
        category: string;
        investedAmount: number;
        currentValue: number;
        profitability: string;
        annualYield?: string;
        liquidity?: string;
      }>;
    }>;
  };
};

export type TodoTask = {
  id: string;
  title: string;
  completed: boolean;
};
