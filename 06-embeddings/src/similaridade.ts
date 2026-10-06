function norma(vetor: readonly number[]): number {
  let soma = 0;

  for (const valor of vetor) {
    if (!Number.isFinite(valor)) {
      throw new Error("O vetor contém um valor que não é um número finito.");
    }

    soma += valor * valor;
  }

  return Math.sqrt(soma);
}

/**
 * Similaridade do cosseno entre dois vetores: produto escalar dividido pelo
 * produto das normas. O resultado fica entre -1 e 1.
 *
 * Lança erro, em vez de devolver um número, quando a comparação não tem
 * significado: vetores vazios, dimensões diferentes ou norma zero.
 */
export function similaridadeCosseno(
  a: readonly number[],
  b: readonly number[],
): number {
  if (a.length === 0 || b.length === 0) {
    throw new Error("Não é possível comparar vetores vazios.");
  }

  if (a.length !== b.length) {
    throw new Error(
      `Dimensões incompatíveis: ${a.length} e ${b.length}.`,
    );
  }

  const normaA = norma(a);
  const normaB = norma(b);

  if (normaA === 0 || normaB === 0) {
    throw new Error(
      "Similaridade do cosseno indefinida para vetor de norma zero.",
    );
  }

  let produtoEscalar = 0;
  for (let i = 0; i < a.length; i++) {
    produtoEscalar += a[i]! * b[i]!;
  }

  return produtoEscalar / (normaA * normaB);
}
