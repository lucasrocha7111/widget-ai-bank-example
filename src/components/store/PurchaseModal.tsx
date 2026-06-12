type PurchaseModalProps = {
  productName: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function PurchaseModal({
  productName,
  onCancel,
  onConfirm,
}: PurchaseModalProps) {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-card">
        <h3>Confirmar compra</h3>
        <p>
          Você será redirecionado para o BankPOC para autenticar e concluir a
          compra de <strong>{productName}</strong>.
        </p>
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onCancel}>
            Não
          </button>
          <button type="button" onClick={onConfirm}>
            Sim, continuar
          </button>
        </div>
      </div>
    </div>
  );
}
