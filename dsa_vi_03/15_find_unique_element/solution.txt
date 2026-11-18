class Solution {
    public int findUnique(int k, int[] arr) {
        int INT_SIZE = 8 * Integer.BYTES; // Assuming 4 bytes for an integer
        int[] count = new int[INT_SIZE];

        int n = arr.length;

        for (int i = 0; i < INT_SIZE; i++) {
            for (int j = 0; j < n; j++) {
                if ((arr[j] & (1 << i)) != 0) {
                    count[i] += 1;
                }
            }
        }

        // Now consider all bits whose count is
        // not multiple of k to form the required
        // number.
        int res = 0;
        for (int i = 0; i < INT_SIZE; i++) {
            res += (count[i] % k) * (1 << i);
        }
        return res;
    }
}