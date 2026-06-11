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
};

export type TodoTask = {
    id: string;
    title: string;
    completed: boolean;
};
