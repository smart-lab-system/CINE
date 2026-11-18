// User function Template for Java

class Solution {
    public List<Integer> singleNumber(int[] arr) {
        int xor = 0;
        for(int i = 0; i < arr.length; i++) {
            xor ^= arr[i];
        }
        
        int pos = 0;
        for(int i = 0; i < 32; i++) {
            if(((xor >> i)&1) == 1)
            {
                pos = i;
                break;
            }
        }
        
        int pos1 = 0;
        int pos2 = 0;
        
        for(int i = 0; i < arr.length; i++) {
            if(((arr[i] ^ pos)&1) == 1) {
                pos1 ^= arr[i];
            } else {
                pos2 ^= arr[i];
            }
        }
        
        List<Integer> x = Arrays.asList(pos1, pos2);
        Collections.sort(x);
        
        return x;
    }
}