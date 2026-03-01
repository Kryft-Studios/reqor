import { CLI } from "@briklab/lib/cli-john";
import * as process from "node:process";

// Game state
let board = [" ", " ", " ", " ", " ", " ", " ", " ", " "];
let currentPlayer = 'X';
let gameActive = true;

// Helper functions
function displayBoard() {
    console.log("\n");
    console.log(` ${board[0]} | ${board[1]} | ${board[2]} `);
    console.log("---|---|---");
    console.log(` ${board[3]} | ${board[4]} | ${board[5]} `);
    console.log("---|---|---");
    console.log(` ${board[6]} | ${board[7]} | ${board[8]} `);
}

function handleMove(position: number) {
    if (position < 0 || position > 8) {
        console.log("⚠️ Position must be between 1-9!");
        return false;
    }
    
    if (board[position] !== ' ') {
        console.log("⚠️ This position is already taken!");
        return false;
    }
    
    board[position] = currentPlayer;
    displayBoard();
    
    // Check for winner
    const winPatterns = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
        [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
        [0, 4, 8], [2, 4, 6] // Diagonals
    ];
    
    for (let pattern of winPatterns) {
        if (board[pattern[0]] && 
            board[pattern[0]] === board[pattern[1]] && 
            board[pattern[0]] === board[pattern[2]]) {
            gameActive = false;
            console.log(`🎉 Player ${currentPlayer} wins!`);
            return true;
        }
    }
    
    // Check for draw
    if (!board.includes(' ')) {
        gameActive = false;
        console.log("🤝 It's a draw!");
        return true;
    }
    
    // Switch player
    currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
    return false;
}

function playInteractive() {
    cli.command("tictactoe").on("command", ({ commandArgs }) => {
        if (commandArgs[0] === "--play") {
            console.log("🎮 Starting Tic Tac Toe Game!");
            console.log("Players take turns entering positions 1-9:");
            console.log(" 1 | 2 | 3 ");
            console.log("---|---|---");
            console.log(" 4 | 5 | 6 ");
            console.log("---|---|---");
            console.log(" 7 | 8 | 9 ");
            displayBoard();
            runInteractiveGame();
        } else if (commandArgs[0] === "--demo") {
            console.log("🎬 Running Demo Game...");
            runDemoGame();
        } else if (commandArgs[0] === "--rules") {
            console.log("📋 Tic Tac Toe Rules:");
            console.log("• Players take turns marking X and O");
            console.log("• Enter positions 1-9 to place your mark");
            console.log("• First to get 3 in a row wins!");
            console.log("• Positions: 1(top-left) 2(top-middle) 3(top-right)");
            console.log("           4(middle-left) 5(center) 6(middle-right)");
            console.log("           7(bottom-left) 8(bottom-middle) 9(bottom-right)");
        } else if (commandArgs.length === 1 && !isNaN(parseInt(commandArgs[0]))) {
            const position = parseInt(commandArgs[0]) - 1;
            if (handleMove(position)) {
                endGame();
            }
        } else {
            console.log("🎮 Tic Tac Toe CLI");
            console.log("Commands:");
            console.log("  tictactoe --play    - Start interactive game");
            console.log("  tictactoe --demo    - Watch demo game");
            console.log("  tictactoe --rules   - Show rules");
            console.log("  tictactoe [1-9]     - Make a move (position 1-9)");
        }
    });
}

function runInteractiveGame() {
    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    const askMove = () => {
        rl.question(`Player ${currentPlayer}, enter position (1-9): `, (answer:any) => {
            const position = parseInt(answer);
            if (!isNaN(position) && handleMove(position - 1)) {
                rl.close();
            } else {
                console.log("Invalid move! Try again.");
                askMove();
            }
        });
    };
    
    if (gameActive) {
        askMove();
    }
}

function runDemoGame() {
    console.log("🤖 Demo Game: AI vs AI");
    
    function makeRandomMove(): number {
        const availableMoves = [];
        for (let i = 0; i < board.length; i++) {
            if (board[i] === ' ') {
                availableMoves.push(i);
            }
        }
        return availableMoves[Math.floor(Math.random() * availableMoves.length)];
    }
    
    while (gameActive) {
        if (currentPlayer === 'X') {
            const move = makeRandomMove();
            handleMove(move);
        } else {
            const move = makeRandomMove();
            handleMove(move);
        }
        
        if (!gameActive) break;
        currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
    }
}

function endGame() {
    console.log("\n📊 Final Board:");
    displayBoard();
}

// Setup and run CLI
const cli = new CLI(process);
playInteractive();


cli.run();
