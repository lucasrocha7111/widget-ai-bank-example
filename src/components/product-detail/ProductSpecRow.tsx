type ProductSpecRowProps = {
    label: string;
    value: string;
};

export default function ProductSpecRow({ label, value }: ProductSpecRowProps) {
    return (
        <div className="row">
            <span>{label}</span>
            <span>{value}</span>
        </div>
    );
}
