/**
 * db.js
 * Camada de abstração e operações CRUD para o IndexedDB.
 * Responsável por gerenciar a conexão, criação de tabelas (Object Stores),
 * índices e transações atômicas.
 */

const DB_NAME = 'BibliotecaEscolarDB';
const DB_VERSION = 1;

let dbInstance = null;

/**
 * Inicializa a conexão com o IndexedDB e cria a estrutura do banco se necessário.
 * @returns {Promise<IDBDatabase>} Instância do banco de dados.
 */
function initDB() {
    return new Promise((resolve, reject) => {
        if (dbInstance) {
            resolve(dbInstance);
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            console.error("Erro ao abrir IndexedDB:", event.target.error);
            reject(event.target.error);
        };

        request.onsuccess = (event) => {
            dbInstance = event.target.result;
            resolve(dbInstance);
        };

        // Disparado quando a versão do banco muda (ou na primeira criação)
        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            // 1. Tabela: livros
            if (!db.objectStoreNames.contains('livros')) {
                const storeLivros = db.createObjectStore('livros', { keyPath: 'id', autoIncrement: true });
                storeLivros.createIndex('idx_isbn', 'isbn', { unique: true });
                storeLivros.createIndex('idx_titulo', 'titulo', { unique: false });
                storeLivros.createIndex('idx_autor', 'autor', { unique: false });
            }

            // 2. Tabela: alunos
            if (!db.objectStoreNames.contains('alunos')) {
                const storeAlunos = db.createObjectStore('alunos', { keyPath: 'id', autoIncrement: true });
                storeAlunos.createIndex('idx_matricula', 'matricula', { unique: true });
                storeAlunos.createIndex('idx_nome', 'nome', { unique: false });
            }

            // 3. Tabela: emprestimos
            if (!db.objectStoreNames.contains('emprestimos')) {
                const storeEmprestimos = db.createObjectStore('emprestimos', { keyPath: 'id', autoIncrement: true });
                storeEmprestimos.createIndex('idx_idLivro', 'idLivro', { unique: false });
                storeEmprestimos.createIndex('idx_idAluno', 'idAluno', { unique: false });
                storeEmprestimos.createIndex('idx_status', 'status', { unique: false });
            }
        };
    });
}

/**
 * Operações Genéricas de CRUD
 */
const DB = {
    /**
     * Exporta todos os dados do banco.
     */
    exportAllData: async () => {
        const db = await initDB();
        const getStoreData = (storeName) => new Promise((resolve, reject) => {
            const transaction = db.transaction([storeName], 'readonly');
            const request = transaction.objectStore(storeName).getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(e.target.error);
        });

        const livros = await getStoreData('livros');
        const alunos = await getStoreData('alunos');
        const emprestimos = await getStoreData('emprestimos');
        return { livros, alunos, emprestimos };
    },

    /**
     * Importa dados substituindo tudo em uma única transação readwrite.
     */
    importAllData: async (data) => {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['livros', 'alunos', 'emprestimos'], 'readwrite');
            
            transaction.oncomplete = () => resolve();
            transaction.onerror = (e) => reject(e.target.error);
            transaction.onabort = () => reject(new Error("Transação abortada (Rollback automático executado pelo IndexedDB)."));

            const storeLivros = transaction.objectStore('livros');
            const storeAlunos = transaction.objectStore('alunos');
            const storeEmprestimos = transaction.objectStore('emprestimos');

            // Limpa os dados atuais
            storeLivros.clear();
            storeAlunos.clear();
            storeEmprestimos.clear();

            // Insere os novos dados
            try {
                data.livros.forEach(item => storeLivros.put(item));
                data.alunos.forEach(item => storeAlunos.put(item));
                data.emprestimos.forEach(item => storeEmprestimos.put(item));
            } catch (err) {
                transaction.abort();
            }
        });
    },

    /**
     * Adiciona ou atualiza um registro em uma Object Store.
     * @param {string} storeName Nome da tabela.
     * @param {object} item Objeto a ser salvo.
     * @returns {Promise<number>} ID do registro salvo.
     */
    save: async (storeName, item) => {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            
            // Se o item tem ID, atualiza (put), senão insere (add)
            // Como usamos autoIncrement, o put com ID existente atualiza. Sem ID, insere.
            const request = store.put(item);

            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(e.target.error);
        });
    },

    /**
     * Retorna todos os registros de uma Object Store.
     * @param {string} storeName Nome da tabela.
     * @returns {Promise<Array>} Lista de objetos.
     */
    getAll: async (storeName) => {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(e.target.error);
        });
    },

    /**
     * Retorna um registro específico pelo ID.
     * @param {string} storeName Nome da tabela.
     * @param {number} id ID do registro.
     * @returns {Promise<object>} Objeto encontrado.
     */
    getById: async (storeName, id) => {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(id);

            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(e.target.error);
        });
    },

    /**
     * Exclui um registro pelo ID.
     * @param {string} storeName Nome da tabela.
     * @param {number} id ID do registro.
     * @returns {Promise<void>}
     */
    delete: async (storeName, id) => {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = (e) => reject(e.target.error);
        });
    },

    /**
     * Transação Atômica: Registrar Empréstimo
     * Garante que a quantidade do livro seja decrementada e o empréstimo criado juntos.
     * @param {object} emprestimo Dados do empréstimo.
     * @returns {Promise<void>}
     */
    registrarEmprestimo: async (emprestimo) => {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['livros', 'emprestimos'], 'readwrite');
            const storeLivros = transaction.objectStore('livros');
            const storeEmprestimos = transaction.objectStore('emprestimos');

            // 1. Busca o livro
            const getLivroReq = storeLivros.get(emprestimo.idLivro);

            getLivroReq.onsuccess = () => {
                const livro = getLivroReq.result;
                
                // Regra de Negócio: Impedir empréstimo se quantidadeDisponivel for 0
                if (!livro || livro.quantidadeDisponivel <= 0) {
                    transaction.abort();
                    reject(new Error("Livro indisponível para empréstimo."));
                    return;
                }

                // 2. Atualiza a quantidade do livro
                livro.quantidadeDisponivel -= 1;
                storeLivros.put(livro);

                // 3. Salva o empréstimo
                storeEmprestimos.add(emprestimo);
            };

            getLivroReq.onerror = (e) => {
                transaction.abort();
                reject(e.target.error);
            };

            // Se a transação for concluída com sucesso
            transaction.oncomplete = () => resolve();
            transaction.onerror = (e) => reject(e.target.error);
        });
    },

    /**
     * Transação Atômica: Registrar Devolução
     * Atualiza o status do empréstimo e incrementa a quantidade do livro.
     * @param {number} idEmprestimo ID do empréstimo a ser devolvido.
     * @param {string} dataDevolucaoReal Data atual no formato ISO.
     * @returns {Promise<void>}
     */
    registrarDevolucao: async (idEmprestimo, dataDevolucaoReal) => {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['livros', 'emprestimos'], 'readwrite');
            const storeLivros = transaction.objectStore('livros');
            const storeEmprestimos = transaction.objectStore('emprestimos');

            // 1. Busca o empréstimo
            const getEmpReq = storeEmprestimos.get(idEmprestimo);

            getEmpReq.onsuccess = () => {
                const emprestimo = getEmpReq.result;
                
                if (!emprestimo || emprestimo.status === 'devolvido') {
                    transaction.abort();
                    reject(new Error("Empréstimo inválido ou já devolvido."));
                    return;
                }

                // 2. Atualiza o status do empréstimo
                emprestimo.status = 'devolvido';
                emprestimo.dataDevolucaoReal = dataDevolucaoReal;
                storeEmprestimos.put(emprestimo);

                // 3. Busca o livro para atualizar a quantidade
                const getLivroReq = storeLivros.get(emprestimo.idLivro);
                getLivroReq.onsuccess = () => {
                    const livro = getLivroReq.result;
                    if (livro) {
                        livro.quantidadeDisponivel += 1;
                        storeLivros.put(livro);
                    }
                };
            };

            getEmpReq.onerror = (e) => {
                transaction.abort();
                reject(e.target.error);
            };

            transaction.oncomplete = () => resolve();
            transaction.onerror = (e) => reject(e.target.error);
        });
    }
};

// Inicializa o banco ao carregar o script
initDB().catch(console.error);
