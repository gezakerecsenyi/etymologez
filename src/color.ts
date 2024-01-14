export function getRandomColor(): [number, number, number] {
    function getRandomBetween(max: number, min = 0) {
        return min + Math.floor(Math.random() * (max - min + 1));
    }

    return [getRandomBetween(255), getRandomBetween(255), getRandomBetween(255)];
}

export function getContrastColor(R: number, G: number, B: number, A: number = 1) {
    const brightness = R * 0.299 + G * 0.587 + B * 0.114 + (1 - A) * 255;

    return brightness > 150 ? "#131313" : "#dedede";
}