import type { TodoTask } from "../../types";
import TodoItem from "./TodoItem";

type TodoListProps = {
    tasks: TodoTask[];
    busyIds: Set<string>;
    onToggle: (id: string) => void;
};

export default function TodoList({ tasks, busyIds, onToggle }: TodoListProps) {
    return (
        <ul>
            {tasks.map((task) => (
                <TodoItem
                    key={task.id}
                    task={task}
                    busy={busyIds.has(task.id)}
                    onToggle={onToggle}
                />
            ))}
        </ul>
    );
}
