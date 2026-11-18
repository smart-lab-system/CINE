
class Solution {
    public int maxWeightCell(int[] exits) {
        long[] weights = new long[exits.length];
        int ans = -1;

        // Accumulate weights directly based on immediate exit pointers.
        for (int i = 0; i < exits.length; i++) {
            if (exits[i] != -1) {
                weights[exits[i]] += i;
            }
        }

        long maxWeight = Long.MIN_VALUE;
        // If there's a tie, choose the cell with the highest index.
        for (int i = 0; i < exits.length; i++) {
            if (weights[i] >= maxWeight) { // '>= ensures highest index in a tie.
                maxWeight = weights[i];
                ans = i;
            }
        }
        return ans;
    }
}