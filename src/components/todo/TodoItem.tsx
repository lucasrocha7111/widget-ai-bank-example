import type { TodoTask } from "../../types";

type TodoItemProps = {
    task: TodoTask;
    busy: boolean;
    onToggle: (id: string) => void;
};

export default function TodoItem({ task, busy, onToggle }: TodoItemProps) {
    return (
        <li data-id={task.id} data-completed={String(task.completed)} data-busy={String(busy)}>
            <label style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <input
                    type="checkbox"
                    checked={task.completed}
                    disabled={busy}
                    onChange={(event) => {
                        if (event.target.checked) {
                            onToggle(task.id);
                        }
                    }}
                />
                <span>{task.title}</span>
            </label>
        </li>
    );
}
