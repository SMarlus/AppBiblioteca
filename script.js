/**
 * script.js
 * Lógica de interface (UI), manipulação do DOM e regras de negócio derivadas.
 * Interage com a camada de dados (db.js).
 */

document.addEventListener('DOMContentLoaded', () => {
    // ==========================================================================
    // Event Listeners - Backup e Testes
    // ==========================================================================
    document.getElementById('btn-exportar').addEventListener('click', exportarDados);
    document.getElementById('input-importar').addEventListener('change', handleImportarDados);
    document.getElementById('btn-testes-oculto').addEventListener('click', () => {
        if (typeof window.runTests === 'function') window.runTests();
    });

    // ==========================================================================
    // Registro do Service Worker (PWA)
    // ==========================================================================
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./service-worker.js?v=3')
                .then((registration) => {
                    console.log('[PWA] Service Worker registrado com sucesso:', registration.scope);
                })
                .catch((error) => {
                    console.error('[PWA] Falha ao registrar o Service Worker:', error);
                });
        });
    }

    // ==========================================================================
    // Inicialização e Navegação
    // ==========================================================================
    initTabs();
    carregarDadosIniciais();
    configurarDataPrevistaPadrao();

    // ==========================================================================
    // Event Listeners - Formulários
    // ==========================================================================
    document.getElementById('form-livro').addEventListener('submit', handleSalvarLivro);
    document.getElementById('btn-cancelar-livro').addEventListener('click', resetFormLivro);

    document.getElementById('form-aluno').addEventListener('submit', handleSalvarAluno);
    document.getElementById('btn-cancelar-aluno').addEventListener('click', resetFormAluno);

    document.getElementById('form-emprestimo').addEventListener('submit', handleRegistrarEmprestimo);
});

// ==========================================================================
// Funções de UI: Navegação por Abas
// ==========================================================================
function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove classe ativa de todos
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => {
                c.classList.remove('active');
                c.classList.add('hidden');
            });

            // Adiciona classe ativa na aba clicada
            btn.classList.add('active');
            const targetId = btn.getAttribute('data-target');
            const targetContent = document.getElementById(targetId);
            targetContent.classList.remove('hidden');
            targetContent.classList.add('active');
        });
    });
}

// ==========================================================================
// Funções de UI: Feedback Visual (Toasts)
// ==========================================================================
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    // Remove após 3 segundos
    setTimeout(() => {
        toast.classList.add('fade-out');
        toast.addEventListener('animationend', () => toast.remove());
    }, 3000);
}

// ==========================================================================
// Lógica de Negócio: Estado Derivado (Atrasos)
// ==========================================================================
/**
 * Calcula dinamicamente se um empréstimo está atrasado e quantos dias.
 * @param {string} dataPrevistaDevolucao Data no formato YYYY-MM-DD
 * @returns {object} { isAtrasado: boolean, diasAtraso: number }
 */
function calcularAtraso(dataPrevistaDevolucao) {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0); // Zera as horas para comparar apenas datas

    // Corrige o fuso horário ao criar a data a partir da string YYYY-MM-DD
    const partesData = dataPrevistaDevolucao.split('-');
    const dataPrevista = new Date(partesData[0], partesData[1] - 1, partesData[2]);
    dataPrevista.setHours(0, 0, 0, 0);

    if (hoje > dataPrevista) {
        const diffTempo = Math.abs(hoje - dataPrevista);
        const diffDias = Math.ceil(diffTempo / (1000 * 60 * 60 * 24));
        return { isAtrasado: true, diasAtraso: diffDias };
    }

    return { isAtrasado: false, diasAtraso: 0 };
}

/**
 * Formata uma data YYYY-MM-DD para DD/MM/YYYY
 */
function formatarData(dataISO) {
    if (!dataISO) return '-';
    const partes = dataISO.split('-');
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

/**
 * Define a data prevista padrão para 7 dias a partir de hoje no formulário.
 */
function configurarDataPrevistaPadrao() {
    const inputData = document.getElementById('emprestimo-data-prevista');
    const dataPadrao = new Date();
    dataPadrao.setDate(dataPadrao.getDate() + 7); // Regra: 7 dias de prazo
    
    // Formata para YYYY-MM-DD para o input type="date"
    const ano = dataPadrao.getFullYear();
    const mes = String(dataPadrao.getMonth() + 1).padStart(2, '0');
    const dia = String(dataPadrao.getDate()).padStart(2, '0');
    
    inputData.value = `${ano}-${mes}-${dia}`;
}

// ==========================================================================
// Controladores (Controllers): Livros
// ==========================================================================
async function carregarDadosIniciais() {
    await renderizarTabelaLivros();
    await renderizarTabelaAlunos();
    await renderizarTabelaEmprestimos();
    await atualizarSelectsEmprestimo();
}

async function handleSalvarLivro(event) {
    event.preventDefault();
    
    const idInput = document.getElementById('livro-id').value;
    const qtdTotal = parseInt(document.getElementById('livro-qtd').value, 10);
    
    const livro = {
        titulo: document.getElementById('livro-titulo').value.trim(),
        autor: document.getElementById('livro-autor').value.trim(),
        isbn: document.getElementById('livro-isbn').value.trim(),
        quantidadeTotal: qtdTotal,
        // Se for novo, qtd disponível = total. Se for edição, mantemos a lógica complexa de ajuste fora do escopo básico,
        // mas para simplificar, se não tiver ID, é novo.
        quantidadeDisponivel: qtdTotal 
    };

    if (idInput) {
        livro.id = parseInt(idInput, 10);
        // Recupera o livro antigo para não sobrescrever a quantidade disponível incorretamente
        try {
            const livroAntigo = await DB.getById('livros', livro.id);
            const diferencaTotal = qtdTotal - livroAntigo.quantidadeTotal;
            livro.quantidadeDisponivel = livroAntigo.quantidadeDisponivel + diferencaTotal;
            
            if (livro.quantidadeDisponivel < 0) {
                showToast("Erro: Quantidade total não pode ser menor que os livros já emprestados.", "error");
                return;
            }
        } catch (e) {
            console.error(e);
        }
    }

    try {
        await DB.save('livros', livro);
        showToast(idInput ? "Livro atualizado!" : "Livro cadastrado!");
        resetFormLivro();
        await renderizarTabelaLivros();
        await atualizarSelectsEmprestimo();
    } catch (error) {
        showToast("Erro ao salvar livro. Verifique se o ISBN já existe.", "error");
        console.error(error);
    }
}

async function renderizarTabelaLivros() {
    const tbody = document.querySelector('#tabela-livros tbody');
    tbody.innerHTML = '';
    
    try {
        const livros = await DB.getAll('livros');
        
        if (livros.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center">Nenhum livro cadastrado.</td></tr>';
            return;
        }

        livros.forEach(livro => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${livro.titulo}</td>
                <td>${livro.autor}</td>
                <td>${livro.isbn}</td>
                <td><strong>${livro.quantidadeDisponivel}</strong> / ${livro.quantidadeTotal}</td>
                <td class="td-actions">
                    <button class="btn btn-sm btn-secondary" onclick="editarLivro(${livro.id})">Editar</button>
                    <button class="btn btn-sm btn-danger" onclick="excluirLivro(${livro.id})">Excluir</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error("Erro ao carregar livros:", error);
    }
}

async function editarLivro(id) {
    try {
        const livro = await DB.getById('livros', id);
        if (livro) {
            document.getElementById('livro-id').value = livro.id;
            document.getElementById('livro-titulo').value = livro.titulo;
            document.getElementById('livro-autor').value = livro.autor;
            document.getElementById('livro-isbn').value = livro.isbn;
            document.getElementById('livro-qtd').value = livro.quantidadeTotal;
            
            document.getElementById('btn-cancelar-livro').classList.remove('hidden');
            
            // Muda para a aba de livros
            document.querySelector('.tab-btn[data-target="tab-livros"]').click();
        }
    } catch (error) {
        showToast("Erro ao carregar dados do livro.", "error");
    }
}

async function excluirLivro(id) {
    if (confirm("Tem certeza que deseja excluir este livro? Esta ação não pode ser desfeita.")) {
        try {
            await DB.delete('livros', id);
            showToast("Livro excluído com sucesso.");
            await renderizarTabelaLivros();
            await atualizarSelectsEmprestimo();
        } catch (error) {
            showToast("Erro ao excluir livro.", "error");
        }
    }
}

function resetFormLivro() {
    document.getElementById('form-livro').reset();
    document.getElementById('livro-id').value = '';
    document.getElementById('btn-cancelar-livro').classList.add('hidden');
}

// ==========================================================================
// Controladores (Controllers): Alunos
// ==========================================================================
async function handleSalvarAluno(event) {
    event.preventDefault();
    
    const idInput = document.getElementById('aluno-id').value;
    
    const aluno = {
        nome: document.getElementById('aluno-nome').value.trim(),
        matricula: document.getElementById('aluno-matricula').value.trim(),
        turma: document.getElementById('aluno-turma').value.trim()
    };

    if (idInput) {
        aluno.id = parseInt(idInput, 10);
    }

    try {
        await DB.save('alunos', aluno);
        showToast(idInput ? "Aluno atualizado!" : "Aluno cadastrado!");
        resetFormAluno();
        await renderizarTabelaAlunos();
        await atualizarSelectsEmprestimo();
    } catch (error) {
        showToast("Erro ao salvar aluno. Verifique se a matrícula já existe.", "error");
        console.error(error);
    }
}

async function renderizarTabelaAlunos() {
    const tbody = document.querySelector('#tabela-alunos tbody');
    tbody.innerHTML = '';
    
    try {
        const alunos = await DB.getAll('alunos');
        
        if (alunos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center">Nenhum aluno cadastrado.</td></tr>';
            return;
        }

        alunos.forEach(aluno => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${aluno.nome}</td>
                <td>${aluno.matricula}</td>
                <td>${aluno.turma}</td>
                <td class="td-actions">
                    <button class="btn btn-sm btn-secondary" onclick="editarAluno(${aluno.id})">Editar</button>
                    <button class="btn btn-sm btn-danger" onclick="excluirAluno(${aluno.id})">Excluir</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error("Erro ao carregar alunos:", error);
    }
}

async function editarAluno(id) {
    try {
        const aluno = await DB.getById('alunos', id);
        if (aluno) {
            document.getElementById('aluno-id').value = aluno.id;
            document.getElementById('aluno-nome').value = aluno.nome;
            document.getElementById('aluno-matricula').value = aluno.matricula;
            document.getElementById('aluno-turma').value = aluno.turma;
            
            document.getElementById('btn-cancelar-aluno').classList.remove('hidden');
            
            document.querySelector('.tab-btn[data-target="tab-alunos"]').click();
        }
    } catch (error) {
        showToast("Erro ao carregar dados do aluno.", "error");
    }
}

async function excluirAluno(id) {
    if (confirm("Tem certeza que deseja excluir este aluno? Esta ação não pode ser desfeita.")) {
        try {
            await DB.delete('alunos', id);
            showToast("Aluno excluído com sucesso.");
            await renderizarTabelaAlunos();
            await atualizarSelectsEmprestimo();
        } catch (error) {
            showToast("Erro ao excluir aluno.", "error");
        }
    }
}

function resetFormAluno() {
    document.getElementById('form-aluno').reset();
    document.getElementById('aluno-id').value = '';
    document.getElementById('btn-cancelar-aluno').classList.add('hidden');
}

// ==========================================================================
// Controladores (Controllers): Empréstimos
// ==========================================================================
async function atualizarSelectsEmprestimo() {
    const selectLivro = document.getElementById('emprestimo-livro');
    const selectAluno = document.getElementById('emprestimo-aluno');
    
    try {
        const livros = await DB.getAll('livros');
        const alunos = await DB.getAll('alunos');
        
        // Atualiza Select de Livros (Apenas disponíveis)
        selectLivro.innerHTML = '<option value="">Selecione um livro disponível...</option>';
        livros.forEach(livro => {
            if (livro.quantidadeDisponivel > 0) {
                const option = document.createElement('option');
                option.value = livro.id;
                option.textContent = `${livro.titulo} (${livro.quantidadeDisponivel} disp.)`;
                selectLivro.appendChild(option);
            }
        });

        // Atualiza Select de Alunos
        selectAluno.innerHTML = '<option value="">Selecione um aluno...</option>';
        alunos.forEach(aluno => {
            const option = document.createElement('option');
            option.value = aluno.id;
            option.textContent = `${aluno.nome} - ${aluno.turma}`;
            selectAluno.appendChild(option);
        });
    } catch (error) {
        console.error("Erro ao atualizar selects:", error);
    }
}

async function handleRegistrarEmprestimo(event) {
    event.preventDefault();
    
    const idLivro = parseInt(document.getElementById('emprestimo-livro').value, 10);
    const idAluno = parseInt(document.getElementById('emprestimo-aluno').value, 10);
    const dataPrevistaDevolucao = document.getElementById('emprestimo-data-prevista').value;
    
    // Formata a data de hoje para YYYY-MM-DD
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const dia = String(hoje.getDate()).padStart(2, '0');
    const dataEmprestimo = `${ano}-${mes}-${dia}`;

    const emprestimo = {
        idLivro,
        idAluno,
        dataEmprestimo,
        dataPrevistaDevolucao,
        dataDevolucaoReal: null,
        status: 'ativo'
    };

    try {
        // Usa a transação atômica
        await DB.registrarEmprestimo(emprestimo);
        showToast("Empréstimo registrado com sucesso!");
        document.getElementById('form-emprestimo').reset();
        configurarDataPrevistaPadrao();
        
        // Atualiza as views
        await renderizarTabelaLivros();
        await renderizarTabelaEmprestimos();
        await atualizarSelectsEmprestimo();
    } catch (error) {
        showToast(error.message || "Erro ao registrar empréstimo.", "error");
        console.error(error);
    }
}

async function renderizarTabelaEmprestimos() {
    const tbody = document.querySelector('#tabela-emprestimos tbody');
    tbody.innerHTML = '';
    
    try {
        const emprestimos = await DB.getAll('emprestimos');
        const livros = await DB.getAll('livros');
        const alunos = await DB.getAll('alunos');
        
        // Cria mapas para busca rápida (O(1))
        const mapaLivros = new Map(livros.map(l => [l.id, l.titulo]));
        const mapaAlunos = new Map(alunos.map(a => [a.id, a.nome]));

        if (emprestimos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">Nenhum empréstimo registrado.</td></tr>';
            return;
        }

        // Ordena para mostrar os ativos primeiro
        emprestimos.sort((a, b) => {
            if (a.status === 'ativo' && b.status === 'devolvido') return -1;
            if (a.status === 'devolvido' && b.status === 'ativo') return 1;
            return 0;
        });

        emprestimos.forEach(emp => {
            const tituloLivro = mapaLivros.get(emp.idLivro) || 'Livro Excluído';
            const nomeAluno = mapaAlunos.get(emp.idAluno) || 'Aluno Excluído';
            
            const tr = document.createElement('tr');
            
            // Lógica de Estado Derivado: Atraso
            let statusBadge = '';
            let acoesHtml = '';
            
            if (emp.status === 'devolvido') {
                statusBadge = `<span style="color: var(--success-color); font-weight: 600;">Devolvido em ${formatarData(emp.dataDevolucaoReal)}</span>`;
                acoesHtml = `<span style="color: var(--text-muted)">Concluído</span>`;
            } else {
                // Calcula atraso dinamicamente
                const { isAtrasado, diasAtraso } = calcularAtraso(emp.dataPrevistaDevolucao);
                
                if (isAtrasado) {
                    // Exibição visual de atraso
                    statusBadge = `<span class="badge-atrasado" style="color: var(--danger-color); font-weight: 600;">Atrasado (${diasAtraso} dias)</span>`;
                    tr.style.backgroundColor = 'rgba(239, 68, 68, 0.05)'; // Fundo levemente vermelho
                } else {
                    statusBadge = `<span style="color: var(--primary-color); font-weight: 600;">Ativo</span>`;
                }
                
                acoesHtml = `<button class="btn btn-sm btn-success" onclick="registrarDevolucao(${emp.id})">Devolver</button>`;
            }

            tr.innerHTML = `
                <td>${tituloLivro}</td>
                <td>${nomeAluno}</td>
                <td>${formatarData(emp.dataEmprestimo)}</td>
                <td>${formatarData(emp.dataPrevistaDevolucao)}</td>
                <td>${statusBadge}</td>
                <td class="td-actions">${acoesHtml}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error("Erro ao carregar empréstimos:", error);
    }
}

async function registrarDevolucao(idEmprestimo) {
    if (confirm("Confirmar a devolução deste livro?")) {
        try {
            const hoje = new Date();
            const ano = hoje.getFullYear();
            const mes = String(hoje.getMonth() + 1).padStart(2, '0');
            const dia = String(hoje.getDate()).padStart(2, '0');
            const dataDevolucaoReal = `${ano}-${mes}-${dia}`;

            // Usa a transação atômica
            await DB.registrarDevolucao(idEmprestimo, dataDevolucaoReal);
            
            showToast("Devolução registrada com sucesso!", "success");
            
            // Atualiza as views
            await renderizarTabelaLivros();
            await renderizarTabelaEmprestimos();
            await atualizarSelectsEmprestimo();
        } catch (error) {
            showToast(error.message || "Erro ao registrar devolução.", "error");
            console.error(error);
        }
    }
}

// ==========================================================================
// Sistema de Backup e Restauração
// ==========================================================================
function gerarChecksumSimples(objeto) {
    // Remove espaços e quebras de linha para garantir consistência
    const str = JSON.stringify(objeto).replace(/\s/g, '');
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash += str.charCodeAt(i);
    }
    return hash.toString(16);
}

async function exportarDados() {
    try {
        const dados = await DB.exportAllData();
        const totalRegistros = dados.livros.length + dados.alunos.length + dados.emprestimos.length;

        const payload = {
            versao: "1.0",
            dataExportacao: new Date().toISOString(),
            totalRegistros: totalRegistros,
            livros: dados.livros,
            alunos: dados.alunos,
            emprestimos: dados.emprestimos
        };

        payload.checksum = gerarChecksumSimples(payload);

        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const dataStr = payload.dataExportacao.split('T')[0];
        a.download = `backup-biblioteca-${dataStr}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast("Backup exportado com sucesso!");
    } catch (e) {
        showToast("Erro ao exportar dados.", "error");
        console.error(e);
    }
}

function validarBackup(json) {
    // 2) Estrutura mínima
    if (!json.versao || !json.dataExportacao || json.totalRegistros === undefined || !json.checksum) {
        throw new Error("Estrutura do backup inválida (campos raiz ausentes).");
    }

    // 3) Arrays realmente arrays
    if (!Array.isArray(json.livros) || !Array.isArray(json.alunos) || !Array.isArray(json.emprestimos)) {
        throw new Error("Estrutura de dados corrompida (esperado arrays).");
    }

    // 6) totalRegistros confere
    const somaReal = json.livros.length + json.alunos.length + json.emprestimos.length;
    if (json.totalRegistros !== somaReal) {
        throw new Error("Total de registros não confere com a soma real.");
    }

    // 7) checksum válido
    const checksumOriginal = json.checksum;
    delete json.checksum; // Remove para recalcular
    const checksumCalculado = gerarChecksumSimples(json);
    json.checksum = checksumOriginal; // Restaura o objeto original
    
    if (checksumOriginal !== checksumCalculado) {
        throw new Error("Checksum inválido. O arquivo foi modificado ou está corrompido.");
    }

    // 4 & 5) Tipos primitivos e campos obrigatórios
    validarEstrutura(json.livros, ['id', 'titulo', 'autor', 'isbn', 'quantidadeTotal', 'quantidadeDisponivel']);
    validarEstrutura(json.alunos, ['id', 'nome', 'matricula', 'turma']);
    validarEstrutura(json.emprestimos, ['id', 'idLivro', 'idAluno', 'dataEmprestimo', 'dataPrevistaDevolucao', 'status']);
}

function validarEstrutura(array, camposObrigatorios) {
    for (let item of array) {
        if (typeof item !== 'object' || item === null) throw new Error("Item inválido no array (não é objeto).");
        for (let campo of camposObrigatorios) {
            if (!(campo in item)) {
                throw new Error(`Campo obrigatório '${campo}' ausente em um dos registros.`);
            }
        }
    }
}

async function handleImportarDados(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            // 1) JSON válido (try/catch)
            let json;
            try {
                json = JSON.parse(e.target.result);
            } catch (err) {
                throw new Error("Arquivo não é um JSON válido.");
            }

            // Validações profundas
            validarBackup(json);

            if (!confirm("Atenção: A restauração substituirá TODOS os dados atuais. Deseja continuar?")) {
                event.target.value = ''; // Reseta o input
                return;
            }

            // Criar backup temporário automático antes de restaurar (em memória)
            const backupTemporario = await DB.exportAllData();

            try {
                // Inserir dados em uma única transação readwrite
                await DB.importAllData(json);
                showToast("Restauração concluída com sucesso!", "success");
                carregarDadosIniciais(); // Recarrega a UI
            } catch (err) {
                // Rollback manual restaurando backup temporário
                console.warn("Falha na restauração. Executando rollback para o backup temporário...");
                await DB.importAllData(backupTemporario);
                throw new Error("Erro durante a gravação no banco. Rollback executado com sucesso.");
            }

        } catch (error) {
            showToast(`Erro na restauração: ${error.message}`, "error");
            console.error(error);
        } finally {
            event.target.value = ''; // Reseta o input para permitir importar o mesmo arquivo novamente
        }
    };
    reader.readAsText(file);
}
