// User function Template for Java

class Solution {
    public List<Integer> singleNumber(int[] arr) {
        int xor = 0;
        for(int i : arr){
            xor ^= i;
        }
        int rightmostBit = xor & -xor;
        int num1 = 0 , num2 = 0;
        for(int num : arr){
            if ((num & rightmostBit) == 0) {
                num1 ^= num;
            } else {
                num2 ^= num;
            }
        }
       List<Integer> result = Arrays.asList(num1 , num2);
       Collections.sort(result);
       return result;
    }
}