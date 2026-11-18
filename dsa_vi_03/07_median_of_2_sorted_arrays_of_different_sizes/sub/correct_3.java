

// User function Template for Java

class Solution {
    public double medianOf2(int a[], int b[]) {
        // Your Code Here
        int[] array = new int[a.length+b.length];
        int i=0,j=0,k=0;
        while(i<a.length && j<b.length){
            if(a[i]<=b[j]){
                array[k++] = a[i++];
            }
            else{
                array[k++] = b[j++];
            }
        }
        while(i<a.length){
            array[k++] = a[i++];
        }
        while(j<b.length){
            array[k++] = b[j++];
        }
        int n = array.length;
        if(n%2 == 0){
            return (double)(array[(n/2)-1]+array[n/2])/2;
        }
        else{
            return array[n/2];
        }
    }
}